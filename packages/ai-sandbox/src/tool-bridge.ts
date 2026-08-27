import { createServer } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { AddressInfo } from 'node:net'
import type { AnyTool } from '@tanstack/ai'

export const BRIDGED_MCP_SERVER_NAME = 'tanstack'

/** Hostname the sandbox uses to reach the bridge endpoint, per provider. */
export function hostForSandbox(provider: string): string {
  return provider === 'docker' || provider === 'sbx'
    ? 'host.docker.internal'
    : '127.0.0.1'
}

/** Result of a permission decision returned to the harness's prompt tool. */
export interface PermissionToolResult {
  behavior: 'allow' | 'deny'
  message?: string
  updatedInput?: unknown
}

export interface BridgePermission {
  toolName: string
  resolve: (input: {
    tool_name?: string
    input?: unknown
  }) => PermissionToolResult | Promise<PermissionToolResult>
}

export interface ToolBridgeCoreOptions {
  /** Runtime context forwarded to each tool's `execute()`. */
  context?: unknown
  /** Abort signal forwarded to each tool's `execute()`. */
  signal?: AbortSignal
  emitCustomEvent?: (eventName: string, value: Record<string, unknown>) => void
  permission?: BridgePermission
}

/** An MCP tool descriptor as advertised to the in-sandbox agent. */
export interface ToolDescriptor {
  name: string
  description?: string
  inputSchema: { type: 'object'; [key: string]: unknown }
}

function toObjectSchema(schema: unknown): {
  type: 'object'
  [key: string]: unknown
} {
  const isObjectSchema =
    schema !== null &&
    typeof schema === 'object' &&
    'type' in schema &&
    schema.type === 'object'
  if (isObjectSchema) {
    return { ...schema, type: 'object' }
  }
  return { type: 'object', properties: {} }
}

/** MCP `tools/call` result shape. */
export interface ToolCallResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

export interface ToolBridgeCore {
  listTools: () => Array<ToolDescriptor>
  callTool: (name: string, args: unknown) => Promise<ToolCallResult>
}

/** Build the transport-agnostic bridge core for the given tools. */
export function createToolBridgeCore(
  tools: Array<AnyTool>,
  options: ToolBridgeCoreOptions = {},
): ToolBridgeCore {
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]))
  const permission = options.permission

  const permissionDescriptor: ToolDescriptor | undefined = permission
    ? {
        name: permission.toolName,
        description:
          'Permission prompt: returns {behavior:"allow"|"deny"} for a requested action.',
        inputSchema: { type: 'object', properties: {} },
      }
    : undefined

  return {
    listTools() {
      return [
        ...tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: toObjectSchema(tool.inputSchema),
        })),
        ...(permissionDescriptor ? [permissionDescriptor] : []),
      ]
    },

    async callTool(name, args) {
      const isPermissionTool = permission && name === permission.toolName
      if (isPermissionTool) {
        const result = await permission.resolve(args ?? {})
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      }
      const tool = toolsByName.get(name)
      if (!tool?.execute) throw new Error(`Unknown tool: ${name}`)
      try {
        const result: unknown = await tool.execute(args ?? {}, {
          context: options.context,
          abortSignal: options.signal,
          // No-op default so tools that always call it (e.g. code mode) don't
          // crash when the transport didn't wire a sink.
          emitCustomEvent: options.emitCustomEvent ?? (() => {}),
        })
        const text =
          typeof result === 'string' ? result : JSON.stringify(result)
        return { content: [{ type: 'text', text }] }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          isError: true,
          content: [
            { type: 'text', text: `Tool execution failed: ${message}` },
          ],
        }
      }
    },
  }
}

export async function handleBridgeJsonRpc(
  core: ToolBridgeCore,
  message: unknown,
): Promise<unknown> {
  if (message === null || typeof message !== 'object') {
    return {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'Invalid Request' },
    }
  }
  const rpc = message as { id?: unknown; method?: unknown; params?: unknown }
  const id = rpc.id ?? null
  const respond = (result: unknown): unknown => ({ jsonrpc: '2.0', id, result })
  switch (rpc.method) {
    case 'initialize':
      return respond({
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: BRIDGED_MCP_SERVER_NAME, version: '1.0.0' },
      })
    case 'notifications/initialized':
      return null
    case 'tools/list':
      return respond({ tools: core.listTools() })
    case 'tools/call': {
      const params = (rpc.params ?? {}) as {
        name?: unknown
        arguments?: unknown
      }
      if (typeof params.name !== 'string') {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: 'Invalid params: name' },
        }
      }
      return respond(await core.callTool(params.name, params.arguments ?? {}))
    }
    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: 'Method not found' },
      }
  }
}

export function timingSafeBearerEqual(
  header: string | undefined,
  token: string,
): boolean {
  if (header === undefined) return false
  const a = Buffer.from(header)
  const b = Buffer.from(`Bearer ${token}`)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export interface HostToolBridge {
  /** MCP server name; tools appear to the agent as `mcp__<name>__<tool>`. */
  name: string
  /** URL the SANDBOX uses to reach this bridge. */
  url: string
  /** Per-run bearer token gating the endpoint. */
  token: string
  close: () => Promise<void>
}

export interface StartBridgeOptions extends ToolBridgeCoreOptions {
  /** Hostname the sandbox uses to reach the host (e.g. `host.docker.internal`). */
  hostForSandbox: string
  bindAddress?: string
}

function buildMcpServer(core: ToolBridgeCore): McpServer {
  const server = new McpServer(
    { name: BRIDGED_MCP_SERVER_NAME, version: '1.0.0' },
    { capabilities: { tools: {} } },
  )
  server.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: core.listTools(),
  }))
  server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await core.callTool(
      request.params.name,
      request.params.arguments ?? {},
    )
    return {
      content: result.content,
      ...(result.isError ? { isError: true } : {}),
    }
  })
  return server
}

export async function startHostToolBridge(
  tools: Array<AnyTool>,
  options: StartBridgeOptions,
): Promise<HostToolBridge> {
  const token = randomBytes(24).toString('hex')
  const core = createToolBridgeCore(tools, options)
  // Loopback by default; widen to all interfaces only for the Docker bridge,
  // which a container reaches via host.docker.internal (host gateway).
  const bindAddress =
    options.bindAddress ??
    (options.hostForSandbox === 'host.docker.internal'
      ? '0.0.0.0'
      : '127.0.0.1')

  const httpServer = createServer((req, res) => {
    void (async () => {
      if (!timingSafeBearerEqual(req.headers['authorization'], token)) {
        res.writeHead(401).end('unauthorized')
        return
      }
      const server = buildMcpServer(core)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      })
      res.on('close', () => {
        void transport.close()
        void server.close()
      })
      await server.connect(transport)

      let body = ''
      for await (const chunk of req) body += chunk
      let parsed: unknown
      try {
        parsed = body ? JSON.parse(body) : undefined
      } catch {
        // Malformed agent request → 400, distinct from an internal 500.
        if (!res.headersSent) res.writeHead(400).end('invalid JSON body')
        return
      }
      await transport.handleRequest(req, res, parsed)
    })().catch((error: unknown) => {
      // Log the underlying fault — on the host/Docker path there is no run-log
      // capturing it, so swallowing it leaves an operator with nothing.
      console.error('[tool-bridge] request handler failed:', error)
      if (!res.headersSent) res.writeHead(500).end('bridge error')
    })
  })

  await new Promise<void>((resolve) =>
    httpServer.listen(0, bindAddress, resolve),
  )
  const port = (httpServer.address() as AddressInfo).port
  const url = `http://${options.hostForSandbox}:${port}/mcp`

  return {
    name: BRIDGED_MCP_SERVER_NAME,
    url,
    token,
    close: () =>
      new Promise<void>((resolve) => httpServer.close(() => resolve())),
  }
}

/** A provisioned, reachable bridge endpoint (same shape as {@link HostToolBridge}). */
export type ProvisionedBridge = HostToolBridge

export interface ToolBridgeProvisionOptions extends ToolBridgeCoreOptions {
  /** Sandbox provider name, to derive how the sandbox reaches the bridge. */
  provider: string
}

export interface ToolBridgeProvisioner {
  provision: (
    tools: Array<AnyTool>,
    options: ToolBridgeProvisionOptions,
  ) => Promise<ProvisionedBridge>
}

/** Default provisioner: a `node:http` listener on the host. */
export const nodeHttpBridgeProvisioner: ToolBridgeProvisioner = {
  provision(tools, options) {
    const { provider, ...core } = options
    return startHostToolBridge(tools, {
      hostForSandbox: hostForSandbox(provider),
      ...core,
    })
  },
}
