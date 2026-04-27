import { AGUIError, RunAgentInputSchema } from '@ag-ui/core'
import type { Context as AGUIContext } from '@ag-ui/core'
import type { JSONSchema, ModelMessage, UIMessage } from '../types'

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
  const rawMessages = (body as { messages?: Array<Record<string, unknown>> }).messages ?? []
  const messages = parsed.messages.map((m, i) => {
    const raw = rawMessages[i]
    if (raw && typeof raw === 'object' && 'parts' in raw) {
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
