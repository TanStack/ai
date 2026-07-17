import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { Tool as McpToolDef } from '@modelcontextprotocol/sdk/types.js'
import type { ContentPart, ServerTool } from '@tanstack/ai'

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
 * terminal result. Aborting stops this client from waiting and best-effort
 * cancels (`tasks/cancel`) a remote task the server has already created.
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

  // `task` is passed explicitly: the SDK's auto-configuration only engages
  // when its own metadata cache saw this tool in a prior listTools() on this
  // Client instance, which callers of this function cannot rely on.
  const stream = client.experimental.tasks.callToolStream(
    { name: mcpName, arguments: args },
    CallToolResultSchema,
    { signal, task: {} },
  )
  let taskId: string | undefined
  for await (const message of stream) {
    if (message.type === 'taskCreated') taskId = message.task.taskId
    if (message.type === 'result') return message.result
    if (message.type === 'error') {
      // On abort the SDK merely stops polling; the server-side task keeps
      // running until its TTL. Propagate the abort as a best-effort cancel
      // (never masking the original error with a cancel failure).
      if (signal?.aborted && taskId !== undefined) {
        await client.experimental.tasks.cancelTask(taskId).catch(() => {})
      }
      throw message.error
    }
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

/** The server declares task-based execution support for tools/call. */
export function serverSupportsTaskCalls(client: Client): boolean {
  return Boolean(client.getServerCapabilities()?.tasks?.requests?.tools?.call)
}

/**
 * Auto-discovery path: turn raw MCP tool defs into ServerTools. Task-required
 * tools are excluded when the server does not declare the tasks capability
 * for tools/call — every invocation would fail, so they must not be offered
 * to the model.
 */
export function toServerTools(
  client: Client,
  defs: Array<McpToolDef>,
  options: ConvertOptions,
): Array<ServerTool> {
  const supportsTasks = serverSupportsTaskCalls(client)
  return defs
    .filter((def) => !requiresTaskExecution(def) || supportsTasks)
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
        metadata: {
          mcp: {
            serverToolName: def.name,
            serverId: options.prefix,
            uiResourceUri: extractUiResourceUri(def),
          },
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
