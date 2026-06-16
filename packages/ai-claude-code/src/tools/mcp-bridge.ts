/**
 * Host-side MCP tool-proxy bridge.
 *
 * Exposes chat()-provided server tools to the in-sandbox `claude` process as an
 * MCP server reachable over HTTP. The agent (inside the sandbox) calls
 * `mcp__tanstack__<tool>`; the call is proxied OUT to this host server, where
 * the tool's `execute()` runs in the host process (with its closures / DB /
 * secrets), and the result is returned into the sandbox.
 *
 * Transport: Streamable HTTP in stateless mode (a fresh server + transport per
 * request), bound on all interfaces so a Docker container can reach it via
 * `host.docker.internal`, and gated by a per-run bearer token.
 *
 * The engine has already converted each tool's `inputSchema` to JSON Schema, so
 * the low-level `tools/list` / `tools/call` handlers pass schemas through
 * verbatim (no zod round-trip).
 */
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { BRIDGED_MCP_SERVER_NAME } from '../stream/translate'
import type { AddressInfo } from 'node:net'
import type { AnyTool } from '@tanstack/ai'

export interface HostToolBridge {
  /** MCP server name; tools appear to the agent as `mcp__<name>__<tool>`. */
  name: string
  /** URL the SANDBOX uses to reach this bridge. */
  url: string
  /** Per-run bearer token gating the endpoint. */
  token: string
  /** `--mcp-config` JSON for the claude CLI. */
  mcpConfigJson: string
  close: () => Promise<void>
}

export interface StartBridgeOptions {
  /** Hostname the sandbox uses to reach the host (e.g. `host.docker.internal`). */
  hostForSandbox: string
  /** Runtime context forwarded to each tool's `execute()`. */
  context?: unknown
  /** Abort signal forwarded to each tool's `execute()`. */
  signal?: AbortSignal
}

function buildServer(tools: Array<AnyTool>, options: StartBridgeOptions): McpServer {
  const server = new McpServer(
    { name: BRIDGED_MCP_SERVER_NAME, version: '1.0.0' },
    { capabilities: { tools: {} } },
  )
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]))

  server.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: (tool.inputSchema ?? {
        type: 'object',
        properties: {},
      }) as { type: 'object'; [key: string]: unknown },
    })),
  }))

  server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolsByName.get(request.params.name)
    if (!tool?.execute) {
      throw new Error(`Unknown tool: ${request.params.name}`)
    }
    try {
      const result: unknown = await tool.execute(request.params.arguments ?? {}, {
        context: options.context,
        abortSignal: options.signal,
      })
      const text = typeof result === 'string' ? result : JSON.stringify(result)
      return { content: [{ type: 'text' as const, text }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `Tool execution failed: ${message}` }],
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
      // Stateless: a fresh server + transport per request.
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

  // Bind on all interfaces so a Docker container reaches it via host-gateway.
  await new Promise<void>((resolve) => httpServer.listen(0, '0.0.0.0', resolve))
  const port = (httpServer.address() as AddressInfo).port
  const url = `http://${options.hostForSandbox}:${port}/mcp`

  const mcpConfigJson = JSON.stringify({
    mcpServers: {
      [BRIDGED_MCP_SERVER_NAME]: {
        type: 'http',
        url,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  })

  return {
    name: BRIDGED_MCP_SERVER_NAME,
    url,
    token,
    mcpConfigJson,
    close: () =>
      new Promise<void>((resolve) => httpServer.close(() => resolve())),
  }
}
