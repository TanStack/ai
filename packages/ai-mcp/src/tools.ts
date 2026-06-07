import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { Tool as McpToolDef } from '@modelcontextprotocol/sdk/types.js'
import type { ContentPart, ServerTool } from '@tanstack/ai'

interface ConvertOptions {
  prefix?: string
  lazy?: boolean
}

export function mcpContentToTanstack(
  content: Array<any>,
): string | Array<ContentPart> {
  // Single text block → plain string (most common, best for the model).
  if (content.length === 1 && content[0]?.type === 'text')
    return content[0].text
  return content.map((c): ContentPart => {
    switch (c.type) {
      case 'text':
        return { type: 'text', content: c.text }
      case 'image':
        return {
          type: 'image',
          source: { type: 'data', value: c.data, mimeType: c.mimeType },
        }
      case 'resource':
        return { type: 'text', content: JSON.stringify(c.resource) }
      default:
        return { type: 'text', content: JSON.stringify(c) }
    }
  })
}

/**
 * Build the execute body that proxies a TanStack tool call to an MCP server's
 * `callTool`. Shared by auto-discovery and the definition path.
 *
 * @param preferStructured when true (i.e. the tool declares an outputSchema),
 *   return `result.structuredContent` if present so the existing output
 *   validation in `executeServerTool` validates MCP's typed payload rather than
 *   a JSON-in-text blob. Otherwise normalize `content[]` → string | ContentPart[].
 */
export function makeMcpExecute(
  client: Client,
  mcpName: string,
  preferStructured: boolean,
) {
  return async (args: unknown, ctx?: { abortSignal?: AbortSignal }) => {
    ctx?.abortSignal?.throwIfAborted()
    const result = await client.callTool(
      { name: mcpName, arguments: (args ?? {}) as Record<string, unknown> },
      undefined,
      { signal: ctx?.abortSignal },
    )
    if (result.isError) {
      const text = Array.isArray(result.content)
        ? mcpContentToTanstack(result.content)
        : undefined
      const detail = typeof text === 'string' ? text : JSON.stringify(text)
      throw new Error(
        text === undefined
          ? `MCP tool "${mcpName}" returned an error`
          : `MCP tool "${mcpName}" returned an error: ${detail}`,
      )
    }
    if (preferStructured && result.structuredContent !== undefined) {
      return result.structuredContent
    }
    return mcpContentToTanstack(result.content as Array<any>)
  }
}

/**
 * A tool with `execution.taskSupport: 'required'` can only run through the
 * SDK's experimental task-based execution (`tasks/callToolStream`) — plain
 * `callTool` is rejected by the server with -32600. Until task execution is
 * supported, such tools must not be offered to the model.
 */
export function requiresTaskExecution(def: McpToolDef): boolean {
  return def.execution?.taskSupport === 'required'
}

/**
 * Auto-discovery path: turn raw MCP tool defs into ServerTools (args typed
 * `unknown`). Task-required tools are excluded — they cannot be invoked via
 * plain `callTool` (see {@link requiresTaskExecution}).
 */
export function toServerTools(
  client: Client,
  defs: Array<McpToolDef>,
  options: ConvertOptions,
): Array<ServerTool> {
  return defs
    .filter((def) => !requiresTaskExecution(def))
    .map((def) => {
      const name = options.prefix ? `${options.prefix}_${def.name}` : def.name
      const tool: ServerTool = {
        __toolSide: 'server',
        name,
        description: def.description ?? '',
        inputSchema: (def.inputSchema as any) ?? {
          type: 'object',
          properties: {},
        },
        ...(def.outputSchema ? { outputSchema: def.outputSchema as any } : {}),
        ...(options.lazy ? { lazy: true } : {}),
        metadata: { mcp: { serverToolName: def.name } },
        execute: makeMcpExecute(client, def.name, Boolean(def.outputSchema)),
      }
      return tool
    })
}
