import { AGUIError, RunAgentInputSchema } from '@ag-ui/core'
import type { Context as AGUIContext } from '@ag-ui/core'
import type { JSONSchema, ModelMessage, Tool, UIMessage } from '../types'

const KNOWN_PART_TYPES = new Set([
  'text',
  'image',
  'audio',
  'video',
  'document',
  'tool-call',
  'tool-result',
  'thinking',
])

function isValidParts(value: unknown): value is Array<{ type: string }> {
  if (!Array.isArray(value)) return false
  for (const p of value) {
    if (!p || typeof p !== 'object') return false
    const type = (p as { type?: unknown }).type
    if (typeof type !== 'string' || !KNOWN_PART_TYPES.has(type)) return false
  }
  return true
}

/**
 * Parse and validate an HTTP request body as an AG-UI `RunAgentInput`.
 *
 * Returns a spread-friendly object whose `messages` field is suitable for
 * passing directly to `chat({ messages })`. The existing
 * `convertMessagesToModelMessages` handles AG-UI fan-out dedup and
 * reasoning/activity/developer-role normalization internally.
 *
 * @throws An error with a migration-pointing message when the body does
 *   not conform to AG-UI 0.0.52 `RunAgentInputSchema`. Surface this as a
 *   400 Bad Request to the client.
 */
export function chatParamsFromRequestBody(body: unknown): Promise<{
  messages: Array<UIMessage | ModelMessage>
  threadId: string
  runId: string
  parentRunId?: string
  tools: Array<{ name: string; description: string; parameters: JSONSchema }>
  forwardedProps: Record<string, unknown>
  state: unknown
  context: Array<AGUIContext>
}> {
  const parseResult = RunAgentInputSchema.safeParse(body)
  if (!parseResult.success) {
    return Promise.reject(
      new AGUIError(
        `Request body is not a valid AG-UI RunAgentInput. ` +
          `If you're upgrading from a previous @tanstack/ai-client release, ` +
          `see docs/migration/ag-ui-compliance.md. ` +
          `Validation errors: ${parseResult.error.message}`,
      ),
    )
  }

  const parsed = parseResult.data

  // AG-UI Zod uses `.strip()` so extra fields like `parts` on messages are
  // dropped during parse. We re-attach them from the original body so the
  // existing UIMessage path inside `chat()` can use them directly.
  const rawMessages =
    (body as { messages?: Array<Record<string, unknown>> }).messages ?? []
  const messages = parsed.messages.map((m, i) => {
    const raw = rawMessages[i]
    if (
      raw &&
      typeof raw === 'object' &&
      'parts' in raw &&
      isValidParts(raw.parts)
    ) {
      return { ...m, parts: raw.parts } as UIMessage | ModelMessage
    }
    return m as ModelMessage
  })

  return Promise.resolve({
    messages,
    threadId: parsed.threadId,
    runId: parsed.runId,
    parentRunId: parsed.parentRunId,
    tools: parsed.tools as Array<{
      name: string
      description: string
      parameters: JSONSchema
    }>,
    forwardedProps: (parsed.forwardedProps ?? {}) as Record<string, unknown>,
    state: parsed.state,
    context: parsed.context,
  })
}

/**
 * Merge a server-side tool registry with the AG-UI client-declared tools
 * received in the request body.
 *
 * Rules:
 * - Server tools win on name collision. The client's declaration is
 *   ignored if the server already has a tool with that name. The client's
 *   UI-side handler still fires when the streamed tool-result event comes
 *   through (see `chat-client.ts` `onToolCall`), giving the
 *   "after server execution the client also handles" semantic for free.
 * - Client-only tools (name not in `serverTools`) become no-execute
 *   entries: the runtime's existing `ClientToolRequest` path handles
 *   them — server emits a tool-call request, client executes via its
 *   registered handler, client posts back the result.
 *
 * @param serverTools - The server's `toolDefinition().server(...)` registry,
 *   keyed by tool name.
 * @param clientTools - The `tools` array received from
 *   `chatParamsFromRequestBody(...)`.
 * @returns A merged record suitable for `chat({ tools })`.
 */
export function mergeAgentTools(
  serverTools: Record<string, Tool>,
  clientTools: Array<{
    name: string
    description: string
    parameters: JSONSchema
  }>,
): Record<string, Tool> {
  const merged: Record<string, Tool> = { ...serverTools }
  for (const ct of clientTools) {
    if (ct.name in merged) {
      // Server wins
      continue
    }
    merged[ct.name] = {
      name: ct.name,
      description: ct.description,
      inputSchema: ct.parameters,
      // No `execute` — runtime treats this as a client-side tool and
      // emits ClientToolRequest events.
    } as Tool
  }
  return merged
}
