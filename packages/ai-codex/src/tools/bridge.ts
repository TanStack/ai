import { createServer } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { BRIDGED_MCP_SERVER_NAME } from '../stream/translate'
import type { AddressInfo } from 'node:net'
import type { AnyTool } from '@tanstack/ai'

/** A running localhost MCP server exposing TanStack tools to the harness. */
export interface ToolBridgeHandle {
  /** Streamable-HTTP MCP endpoint, e.g. `http://127.0.0.1:54321/mcp`. */
  url: string
  /** Stop the HTTP server and drop any open connections. */
  close: () => Promise<void>
}

function createMcpServer(tools: Array<AnyTool>): McpServer {
  const instance = new McpServer(
    { name: BRIDGED_MCP_SERVER_NAME, version: '1.0.0' },
    { capabilities: { tools: {} } },
  )

  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]))

  instance.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: (tool.inputSchema ?? {
        type: 'object',
        properties: {},
      }) as { type: 'object'; [key: string]: unknown },
    })),
  }))

  instance.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolsByName.get(request.params.name)
    if (!tool?.execute) {
      throw new Error(`Unknown tool: ${request.params.name}`)
    }
    try {
      const result: unknown = await tool.execute(request.params.arguments ?? {})
      const text = typeof result === 'string' ? result : JSON.stringify(result)
      return { content: [{ type: 'text', text }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        isError: true,
        content: [{ type: 'text', text: `Tool execution failed: ${message}` }],
      }
    }
  })

  return instance
}

/**
 * Expose TanStack tools to the Codex harness as a Streamable-HTTP MCP server
 * on an ephemeral localhost port.
 *
 * Codex runs as a separate subprocess, so unlike the Claude Code adapter
 * there is no in-process MCP option — the bridge listens on `127.0.0.1` and
 * the adapter points the harness at it via a `mcp_servers.tanstack.url`
 * config override. Each request is handled statelessly with a fresh
 * `McpServer` + transport pair, which is all the harness's list/call traffic
 * needs.
 *
 * The engine has already converted each tool's schema to JSON Schema before
 * the adapter sees it, and JSON Schema is exactly what MCP's `tools/list`
 * wants — so the low-level request handlers pass schemas through verbatim
 * instead of round-tripping them through zod.
 *
 * The caller owns the lifecycle: `close()` must run when the chat stream
 * ends (the adapter does this in a `finally`) so the port is never leaked.
 */
export async function startToolBridge(
  tools: Array<AnyTool>,
): Promise<ToolBridgeHandle> {
  const httpServer = createServer((req, res) => {
    void (async () => {
      if (req.method !== 'POST') {
        res.writeHead(405).end()
        return
      }
      const chunks: Array<Buffer> = []
      for await (const chunk of req) {
        chunks.push(chunk as Buffer)
      }
      let parsedBody: unknown
      try {
        parsedBody = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        res.writeHead(400).end()
        return
      }
      const mcpServer = createMcpServer(tools)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      })
      res.on('close', () => {
        void transport.close()
        void mcpServer.close()
      })
      await mcpServer.connect(transport)
      await transport.handleRequest(req, res, parsedBody)
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  })

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(0, '127.0.0.1', resolve)
  })

  const { port } = httpServer.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}/mcp`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        httpServer.closeAllConnections()
        httpServer.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}
