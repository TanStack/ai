import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
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

/**
 * The human-readable display name for a tool, following the MCP spec's
 * precedence: the top-level `title` field wins, then the legacy
 * `annotations.title`, and finally the programmatic `name`.
 */
function toolDisplayTitle(def: McpToolDef): string {
  return def.title ?? def.annotations?.title ?? def.name
}

/**
 * Build the `metadata.mcp` block stamped onto every discovered/bound tool.
 * Shared by auto-discovery (`toServerTools`) and the explicit `tools(defs)`
 * path in `client.ts` so the two cannot drift.
 *
 * `annotations` is the server's own object, forwarded verbatim. Per the MCP
 * spec its fields (including `title`) are **hints** — a host may use them for
 * display or to shape an approval UI, but never as a security boundary.
 *
 * Fields the server didn't declare are OMITTED rather than set to `undefined`:
 * the explicit path merges this over any `mcp` block the caller already put on
 * their tool definition, and an `undefined` value would blank out what they set.
 */
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
  if (content.length === 1 && content[0]?.type === 'text')
    return content[0].text
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
          if (typeof uri === 'string' && uri.startsWith('ui://')) {
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

/**
 * Call an MCP tool through the execution mode declared by its definition.
 * Task-required tools use the SDK's experimental stream and are drained to the
 * terminal result. Aborting stops this client from waiting, but does not cancel
 * a remote task that the server has already created.
 */
export async function callMcpTool(
  client: Client,
  mcpName: string,
  args: Record<string, unknown>,
  taskRequired: boolean,
  signal?: AbortSignal,
): Promise<Awaited<ReturnType<Client['callTool']>>> {
  signal?.throwIfAborted()
  if (!taskRequired) {
    return client.callTool(
      { name: mcpName, arguments: args },
      CallToolResultSchema,
      { signal },
    )
  }

  const stream = client.experimental.tasks.callToolStream(
    { name: mcpName, arguments: args },
    CallToolResultSchema,
    { signal },
  )
  for await (const message of stream) {
    if (message.type === 'result') return message.result
    if (message.type === 'error') throw message.error
  }
  throw new Error(
    `MCP task-required tool "${mcpName}" ended without a result or error`,
  )
}

/**
 * Build the execute body that proxies a TanStack tool call to an MCP server.
 * Shared by auto-discovery and the definition path.
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
  taskRequired = false,
) {
  return async (args: unknown, ctx?: { abortSignal?: AbortSignal }) => {
    const result = await callMcpTool(
      client,
      mcpName,
      (args ?? {}) as Record<string, unknown>,
      taskRequired,
      ctx?.abortSignal,
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

/** A tool that must use the SDK's experimental task-based execution. */
export function requiresTaskExecution(def: McpToolDef): boolean {
  return def.execution?.taskSupport === 'required'
}

/** Auto-discovery path: turn raw MCP tool defs into ServerTools. */
export function toServerTools(
  client: Client,
  defs: Array<McpToolDef>,
  options: ConvertOptions,
): Array<McpServerTool> {
  return defs.map((def) => {
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
      execute: makeMcpExecute(
        client,
        def.name,
        Boolean(def.outputSchema),
        requiresTaskExecution(def),
      ),
    }
    return tool
  })
}
