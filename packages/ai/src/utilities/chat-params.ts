import { AGUIError } from '@ag-ui/core'
import type { Context as AGUIContext, RunAgentInput } from '@ag-ui/core'
import type {
  JSONSchema,
  ModelMessage,
  SchemaInput,
  Tool,
  UIMessage,
} from '../types'

/**
 * The slice of `RunAgentInputSchema` this module relies on, expressed
 * without referencing zod types. `@ag-ui/core/schemas` runs on zod 3.24+
 * and zod 4, but its emitted declarations are pinned to one zod major —
 * typing the import structurally keeps zod out of this package's
 * compilation and out of its public `.d.ts` (the whole point of
 * https://github.com/TanStack/ai/issues/520).
 */
interface RunAgentInputValidator {
  safeParse: (
    body: unknown,
  ) =>
    | { success: true; data: RunAgentInput }
    | { success: false; error: { message: string } }
}

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
 * Lazily load `RunAgentInputSchema` from the opt-in `@ag-ui/core/schemas`
 * subpath. The subpath has zod as an optional peer dependency, so the import
 * only happens when AG-UI request parsing is actually used — consumers that
 * never call `chatParamsFromRequest*` don't need zod installed at all.
 */
async function loadRunAgentInputSchema(): Promise<RunAgentInputValidator> {
  try {
    const { RunAgentInputSchema } = await import('@ag-ui/core/schemas')
    return RunAgentInputSchema as RunAgentInputValidator
  } catch (cause) {
    const error = new AGUIError(
      `chatParamsFromRequestBody requires zod to validate AG-UI request ` +
        `bodies. Install zod (^3.24.0 || ^4.0.0) alongside @tanstack/ai.`,
    )
    error.cause = cause
    throw error
  }
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
 *   not conform to the AG-UI `RunAgentInputSchema`. Surface this as a
 *   400 Bad Request to the client.
 */
export async function chatParamsFromRequestBody(body: unknown): Promise<{
  messages: Array<UIMessage | ModelMessage>
  threadId: string
  runId: string
  parentRunId?: string
  tools: Array<{ name: string; description: string; parameters: JSONSchema }>
  forwardedProps: Record<string, unknown>
  state: unknown
  /**
   * @deprecated Use `aguiContext` instead. This alias will be removed in a
   * future release.
   */
  context: Array<AGUIContext>
  aguiContext: Array<AGUIContext>
}> {
  const RunAgentInputSchema = await loadRunAgentInputSchema()
  const parseResult = RunAgentInputSchema.safeParse(body)
  if (!parseResult.success) {
    throw new AGUIError(
      `Request body is not a valid AG-UI RunAgentInput. ` +
        `If you're upgrading from a previous @tanstack/ai-client release, ` +
        `see docs/migration/ag-ui-compliance.md. ` +
        `Validation errors: ${parseResult.error.message}`,
    )
  }

  const parsed = parseResult.data
  const aguiContext = parsed.context

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

  return {
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
    context: aguiContext,
    aguiContext,
  }
}

/**
 * Read an HTTP `Request`, parse its JSON body, and validate it as an
 * AG-UI `RunAgentInput` — collapsing the standard `req.json()` +
 * `chatParamsFromRequestBody(...)` pair into a single call.
 *
 * On a malformed body or invalid AG-UI shape, this **throws a
 * `Response`** with status 400 and a migration-pointing message in the
 * body. Frameworks that natively handle thrown `Response` objects
 * (TanStack Start, SolidStart, Remix, React Router 7) will return the
 * 400 to the client automatically, so the handler reduces to:
 *
 * ```ts
 * export async function POST(req: Request) {
 *   const params = await chatParamsFromRequest(req)
 *   // ...use params
 * }
 * ```
 *
 * In frameworks that do not auto-handle thrown `Response` objects
 * (Next.js Route Handlers, SvelteKit, Hono, raw Node), wrap the call
 * with try/catch and return the caught Response yourself, or use
 * `chatParamsFromRequestBody` directly with your own JSON-parsing.
 *
 * @throws {Response} 400 on malformed JSON or invalid AG-UI shape.
 */
export async function chatParamsFromRequest(
  req: Request,
): Promise<Awaited<ReturnType<typeof chatParamsFromRequestBody>>> {
  let body: unknown
  try {
    body = await req.json()
  } catch (cause) {
    // Preserve the underlying error on the thrown Response for
    // server-side observability without leaking it to the client.
    const res = new Response(
      'Invalid AG-UI request body. See docs/migration/ag-ui-compliance.md.',
      { status: 400 },
    )
    ;(res as { cause?: unknown }).cause = cause
    throw res
  }
  try {
    return await chatParamsFromRequestBody(body)
  } catch (cause) {
    // Generic public message — avoid echoing Zod paths (which can contain
    // user payload fragments) or internal validator strings to the client.
    // The original AGUIError is attached as `cause` so server logs can
    // surface it without exposing it to remote callers.
    const res = new Response(
      'Invalid AG-UI request body. See docs/migration/ag-ui-compliance.md.',
      { status: 400 },
    )
    ;(res as { cause?: unknown }).cause = cause
    throw res
  }
}

/**
 * Merge a server-side tool array with the AG-UI client-declared tools
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
 * @param serverTools - The server's tool array (e.g. from
 *   `[myToolDef.server(...)]`). Pass directly to `chat({ tools })`.
 * @param clientTools - The `tools` array received from
 *   `chatParamsFromRequest(...)` / `chatParamsFromRequestBody(...)`.
 * @returns A merged array suitable for `chat({ tools })`.
 */
export function mergeAgentTools<TContext = unknown>(
  serverTools: ReadonlyArray<Tool<SchemaInput, SchemaInput, string, TContext>>,
  clientTools: ReadonlyArray<{
    name: string
    description: string
    parameters: JSONSchema
  }>,
): Array<Tool<SchemaInput, SchemaInput, string, TContext>> {
  const seen = new Set(serverTools.map((t) => t.name))
  const merged: Array<Tool<SchemaInput, SchemaInput, string, TContext>> = [
    ...serverTools,
  ]
  for (const ct of clientTools) {
    if (seen.has(ct.name)) {
      // Server wins on name collision.
      continue
    }
    seen.add(ct.name)
    merged.push({
      name: ct.name,
      description: ct.description,
      inputSchema: ct.parameters,
      // No `execute` — runtime treats this as a client-side tool and
      // emits ClientToolRequest events.
    } as Tool<SchemaInput, SchemaInput, string, TContext>)
  }
  return merged
}
