import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type {
  Tool as McpToolDef,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js'
import type { ContentPart } from '@tanstack/ai'
import type { McpServerTool, McpToolMetadata } from './types'

interface ConvertOptions {
  prefix?: string
  lazy?: boolean
}

/** Reads the MCP Apps `_meta.ui.resourceUri` link from a tool def, if present. */
export function extractUiResourceUri(def: McpToolDef): string | undefined {
  const meta = (def as { _meta?: { ui?: { resourceUri?: unknown } } })._meta
  const uri = meta?.ui?.resourceUri
  return typeof uri === 'string' ? uri : undefined
}

function toolDisplayTitle(def: McpToolDef): string {
  return def.title ?? def.annotations?.title ?? def.name
}

export function toolMcpMetadata(
  def: McpToolDef,
  serverId: string | undefined,
): McpToolMetadata {
  const uiResourceUri = extractUiResourceUri(def)
  const annotations: ToolAnnotations | undefined = def.annotations
  return {
    serverToolName: def.name,
    serverId,
    title: toolDisplayTitle(def),
    ...(uiResourceUri !== undefined ? { uiResourceUri } : {}),
    ...(annotations !== undefined ? { annotations } : {}),
  }
}

export function mcpContentToTanstack(
  content: Array<any>,
): string | Array<ContentPart> {
  // A valid MCP result may carry only structuredContent (no content[]) → guard
  // against undefined/non-array before reading length/map.
  if (!Array.isArray(content)) return ''
  // Single text block → plain string (most common, best for the model).
  if (content.length === 1) {
    if (content[0]?.type === 'text') return content[0].text
  }
  const parts = content
    .map((c): ContentPart => {
      switch (c.type) {
        case 'text':
          return { type: 'text', content: c.text }
        case 'image':
          return {
            type: 'image',
            source: { type: 'data', value: c.data, mimeType: c.mimeType },
          }
        case 'resource': {
          const uri = c.resource?.uri
          const isUiResource =
            typeof uri === 'string' && uri.startsWith('ui://')
          if (isUiResource) {
            // ui:// resources are surfaced via readResource (MCP Apps); omit from model text.
            return { type: 'text', content: '' }
          }
          return { type: 'text', content: JSON.stringify(c.resource) }
        }
        default:
          return { type: 'text', content: JSON.stringify(c) }
      }
    })
    .filter((p) => !(p.type === 'text' && p.content === ''))
  return parts.length ? parts : ''
}

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
      const detail =
        typeof text === 'string'
          ? text
          : text === undefined
            ? undefined
            : JSON.stringify(text)
      // An empty/absent detail (e.g. a ui://-only error body) would render a
      // dangling colon — fall back to the bare message.
      throw new Error(
        !detail
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

export function requiresTaskExecution(def: McpToolDef): boolean {
  return def.execution?.taskSupport === 'required'
}

export function toServerTools(
  client: Client,
  defs: Array<McpToolDef>,
  options: ConvertOptions,
): Array<McpServerTool> {
  return defs
    .filter((def) => !requiresTaskExecution(def))
    .map((def) => {
      const name = options.prefix ? `${options.prefix}_${def.name}` : def.name
      const tool: McpServerTool = {
        __toolSide: 'server',
        name,
        description: def.description ?? '',
        inputSchema: (def.inputSchema as any) ?? {
          type: 'object',
          properties: {},
        },
        ...(def.outputSchema ? { outputSchema: def.outputSchema as any } : {}),
        ...(options.lazy ? { lazy: true } : {}),
        metadata: {
          mcp: toolMcpMetadata(def, options.prefix),
        },
        execute: makeMcpExecute(client, def.name, Boolean(def.outputSchema)),
      }
      return tool
    })
}
