import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { BRIDGED_MCP_SERVER_NAME } from '../stream/translate'
import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk'
import type { AnyTool } from '@tanstack/ai'

/**
 * Expose TanStack tools to the Claude Code harness as an in-process MCP
 * server.
 *
 * The engine has already converted each tool's schema to JSON Schema before
 * the adapter sees it, and JSON Schema is exactly what MCP's `tools/list`
 * wants — so the low-level request handlers are registered directly on the
 * `McpServer`'s underlying server, passing schemas through verbatim instead
 * of round-tripping them through zod.
 *
 * The model sees these tools as `mcp__tanstack__<name>`; the stream
 * translator strips that prefix so tool-call events match the names the
 * application registered.
 */
export function createToolBridge(
  tools: Array<AnyTool>,
): McpSdkServerConfigWithInstance {
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

  return { type: 'sdk', name: BRIDGED_MCP_SERVER_NAME, instance }
}
