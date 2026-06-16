/**
 * Host-side MCP tool-proxy bridge, shared by all harness adapters.
 *
 * Exposes chat()-provided server tools to an in-sandbox agent as an MCP server
 * reachable over HTTP. The agent (inside the sandbox) calls
 * `mcp__tanstack__<tool>`; the call is proxied OUT to this host server, where
 * the tool's `execute()` runs in the host process (with its closures / DB /
 * secrets), and the result is returned into the sandbox.
 *
 * Transport: Streamable HTTP in stateless mode (a fresh server + transport per
 * request), bound on all interfaces so a Docker container can reach it via
 * `host.docker.internal`, and gated by a per-run bearer token.
 *
 * Each harness adapter formats the bridge into its own MCP config shape
 * (`claude --mcp-config`, ACP `mcpServers`, opencode `OPENCODE_CONFIG_CONTENT`,
 * `codex --config mcp_servers.*`).
 */
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { AddressInfo } from 'node:net'
import type { AnyTool } from '@tanstack/ai'

/**
 * Name of the bridged MCP server. The agent sees tools as
 * `mcp__tanstack__<tool>`; each adapter's stream translator strips this prefix
 * so tool-call events match the names the application registered.
 */
export const BRIDGED_MCP_SERVER_NAME = 'tanstack'

/** Hostname the sandbox uses to reach a host-side server, per provider. */
export function hostForSandbox(provider: string): string {
  return provider === 'docker' ? 'host.docker.internal' : '127.0.0.1'
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

/** Result of a permission decision returned to the harness's prompt tool. */
export interface PermissionToolResult {
  behavior: 'allow' | 'deny'
  message?: string
  updatedInput?: unknown
}

export interface StartBridgeOptions {
  /** Hostname the sandbox uses to reach the host (e.g. `host.docker.internal`). */
  hostForSandbox: string
  /** Runtime context forwarded to each tool's `execute()`. */
  context?: unknown
  /** Abort signal forwarded to each tool's `execute()`. */
  signal?: AbortSignal
  /**
   * Optional permission-prompt tool (e.g. for Claude Code's
   * `--permission-prompt-tool`). When set, the bridge exposes an extra MCP tool
   * `<name>` whose handler returns the host's allow/deny decision for an action.
   */
  permission?: {
    toolName: string
    resolve: (input: {
      tool_name?: string
      input?: unknown
    }) => PermissionToolResult | Promise<PermissionToolResult>
  }
}

function buildServer(
  tools: Array<AnyTool>,
  options: StartBridgeOptions,
): McpServer {
  const server = new McpServer(
    { name: BRIDGED_MCP_SERVER_NAME, version: '1.0.0' },
    { capabilities: { tools: {} } },
  )
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]))

  const permissionTool = options.permission
    ? {
        name: options.permission.toolName,
        description:
          'Permission prompt: returns {behavior:"allow"|"deny"} for a requested action.',
        inputSchema: { type: 'object' as const, properties: {} },
      }
    : undefined

  server.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      ...tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: (tool.inputSchema ?? {
          type: 'object',
          properties: {},
        }) as { type: 'object'; [key: string]: unknown },
      })),
      ...(permissionTool ? [permissionTool] : []),
    ],
  }))

  server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Permission-prompt tool: return the host's allow/deny decision.
    if (
      options.permission &&
      request.params.name === options.permission.toolName
    ) {
      const result = await options.permission.resolve(
        request.params.arguments ?? {},
      )
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      }
    }
    const tool = toolsByName.get(request.params.name)
    if (!tool?.execute) {
      throw new Error(`Unknown tool: ${request.params.name}`)
    }
    try {
      const result: unknown = await tool.execute(
        request.params.arguments ?? {},
        {
          context: options.context,
          abortSignal: options.signal,
        },
      )
      const text = typeof result === 'string' ? result : JSON.stringify(result)
      return { content: [{ type: 'text' as const, text }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        isError: true,
        content: [
          { type: 'text' as const, text: `Tool execution failed: ${message}` },
        ],
      }
    }
  })

  return server
}

/** Start the host MCP tool-proxy bridge for the given tools. */
export async function startHostToolBridge(
  tools: Array<AnyTool>,
  options: StartBridgeOptions,
): Promise<HostToolBridge> {
  const token = randomBytes(24).toString('hex')

  const httpServer = createServer((req, res) => {
    void (async () => {
      if (req.headers['authorization'] !== `Bearer ${token}`) {
        res.writeHead(401).end('unauthorized')
        return
      }
      const server = buildServer(tools, options)
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
      await transport.handleRequest(
        req,
        res,
        body ? (JSON.parse(body) as unknown) : undefined,
      )
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500).end('bridge error')
    })
  })

  await new Promise<void>((resolve) => httpServer.listen(0, '0.0.0.0', resolve))
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
