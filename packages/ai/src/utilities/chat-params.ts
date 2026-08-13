import { AGUIError } from '@ag-ui/core'
import type {
  Context as AGUIContext,
  Message as AGUIMessage,
  ResumeEntry as AGUIResumeEntry,
  Role as AGUIRole,
} from '@ag-ui/core'
import type {
  AnyTool,
  JSONSchema,
  ModelMessage,
  RunAgentResumeItem,
  UIMessage,
} from '../types'

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
 * Keyed by `AGUIRole` so a role added upstream fails to compile here until it
 * is handled, rather than silently falling through as an unknown role.
 */
const AGUI_ROLES: Record<AGUIRole, true> = {
  developer: true,
  system: true,
  assistant: true,
  user: true,
  tool: true,
  activity: true,
  reasoning: true,
}

function isAGUIRole(value: unknown): value is AGUIRole {
  return typeof value === 'string' && value in AGUI_ROLES
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Reject the request body, pointing at the migration guide. Mirrors the
 * message the previous `RunAgentInputSchema.safeParse` failure produced.
 */
function invalidBody(reason: string): never {
  throw new AGUIError(
    `Request body is not a valid AG-UI RunAgentInput. ` +
      `If you're upgrading from a previous @tanstack/ai-client release, ` +
      `see docs/migration/ag-ui-compliance.md. ` +
      `Validation errors: ${reason}`,
  )
}

function requireString(value: unknown, at: string): string {
  if (typeof value !== 'string') invalidBody(`${at} must be a string`)
  return value
}

function requireArray(value: unknown, at: string): Array<unknown> {
  if (!Array.isArray(value)) invalidBody(`${at} must be an array`)
  return value
}

/**
 * Assert one AG-UI `Message`, discriminating on `role` exactly as the upstream
 * `MessageSchema` discriminated union does. The record view is retained on the
 * asserted type so callers can still inspect non-AG-UI extras like `parts`.
 */
function assertAGUIMessage(
  value: Record<string, unknown>,
  at: string,
): asserts value is Record<string, unknown> & AGUIMessage {
  requireString(value.id, `${at}.id`)

  const role = value.role
  if (!isAGUIRole(role)) {
    invalidBody(
      `${at}.role must be one of ${Object.keys(AGUI_ROLES).join(' | ')}`,
    )
  }

  switch (role) {
    case 'assistant':
      // Both optional: a tool-calling turn carries no text content.
      if (value.content !== undefined) {
        requireString(value.content, `${at}.content`)
      }
      if (value.toolCalls !== undefined) {
        requireArray(value.toolCalls, `${at}.toolCalls`)
      }
      break
    case 'user':
      if (typeof value.content !== 'string' && !Array.isArray(value.content)) {
        invalidBody(
          `${at}.content must be a string or an array of content parts`,
        )
      }
      break
    case 'tool':
      requireString(value.content, `${at}.content`)
      requireString(value.toolCallId, `${at}.toolCallId`)
      break
    case 'activity':
      requireString(value.activityType, `${at}.activityType`)
      if (!isRecord(value.content)) {
        invalidBody(`${at}.content must be an object`)
      }
      break
    case 'developer':
    case 'system':
    case 'reasoning':
      requireString(value.content, `${at}.content`)
      break
  }
}

function validateMessage(value: unknown, index: number): AGUIMessage {
  const at = `messages[${index}]`
  if (!isRecord(value)) invalidBody(`${at} must be an object`)
  assertAGUIMessage(value, at)

  // `parts` is TanStack's canonical extra, carried through so the UIMessage
  // path inside `chat()` can use it. Keep it only when it holds recognized
  // part types — the previous schema-based path dropped `parts` during parse
  // and re-attached it from the raw body behind this same check.
  if ('parts' in value && !isValidParts(value.parts)) {
    const withoutParts = { ...value }
    Reflect.deleteProperty(withoutParts, 'parts')
    return withoutParts
  }
  return value
}

function validateTool(
  value: unknown,
  index: number,
): { name: string; description: string; parameters: JSONSchema } {
  const at = `tools[${index}]`
  if (!isRecord(value)) invalidBody(`${at} must be an object`)
  return {
    name: requireString(value.name, `${at}.name`),
    description: requireString(value.description, `${at}.description`),
    // Upstream `ToolSchema` types this as optional `any`; it reaches the
    // provider as a raw JSON Schema either way.
    parameters: value.parameters as JSONSchema,
  }
}

function validateContext(value: unknown, index: number): AGUIContext {
  const at = `context[${index}]`
  if (!isRecord(value)) invalidBody(`${at} must be an object`)
  return {
    description: requireString(value.description, `${at}.description`),
    value: requireString(value.value, `${at}.value`),
  }
}

function validateResumeEntry(value: unknown, index: number): AGUIResumeEntry {
  const at = `resume[${index}]`
  if (!isRecord(value)) invalidBody(`${at} must be an object`)
  const status = value.status
  if (status !== 'resolved' && status !== 'cancelled') {
    invalidBody(`${at}.status must be "resolved" or "cancelled"`)
  }
  const entry: AGUIResumeEntry = {
    interruptId: requireString(value.interruptId, `${at}.interruptId`),
    status,
  }
  // Omit the key entirely when absent, matching the optional-field shape the
  // schema produced.
  if (value.payload !== undefined) entry.payload = value.payload
  return entry
}

/**
 * Parse and validate an HTTP request body as an AG-UI `RunAgentInput`.
 *
 * Returns a spread-friendly object whose `messages` field is suitable for
 * passing directly to `chat({ messages })`. The existing
 * `convertMessagesToModelMessages` handles AG-UI fan-out dedup and
 * reasoning/activity/developer-role normalization internally.
 *
 * Validated structurally against the AG-UI `RunAgentInput` contract without a
 * schema library, so this package pulls in no validation runtime of its own.
 *
 * @throws An error with a migration-pointing message when the body does
 *   not conform to AG-UI `RunAgentInput`. Surface this as a
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
  resume?: Array<RunAgentResumeItem>
  /**
   * @deprecated Use `aguiContext` instead. This alias will be removed in a
   * future release.
   */
  context: Array<AGUIContext>
  aguiContext: Array<AGUIContext>
}> {
  if (!isRecord(body)) invalidBody('body must be a JSON object')

  const threadId = requireString(body.threadId, 'threadId')
  const runId = requireString(body.runId, 'runId')
  const parentRunId =
    body.parentRunId === undefined
      ? undefined
      : requireString(body.parentRunId, 'parentRunId')

  const messages = requireArray(body.messages, 'messages').map(validateMessage)
  const tools = requireArray(body.tools, 'tools').map(validateTool)
  const aguiContext = requireArray(body.context, 'context').map(validateContext)
  const resume =
    body.resume === undefined
      ? undefined
      : requireArray(body.resume, 'resume').map(validateResumeEntry)

  if (body.forwardedProps !== undefined && !isRecord(body.forwardedProps)) {
    invalidBody('forwardedProps must be an object')
  }

  return {
    // Unknown top-level fields (e.g. a legacy `cursor`) are dropped by
    // construction: only the fields below are copied onto the result.
    messages: messages as Array<UIMessage | ModelMessage>,
    threadId,
    runId,
    parentRunId,
    tools,
    forwardedProps: (body.forwardedProps ?? {}) as Record<string, unknown>,
    state: body.state,
    resume: resume as Array<RunAgentResumeItem> | undefined,
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
 * Client-declared tool stub (no execute). `name` is `string`, so arrays that
 * include these stubs intentionally widen `TypedStreamChunk` tool-name
 * discrimination — pass server tools alone when you need a closed name union.
 */
export type ClientToolDeclaration = {
  name: string
  description: string
  inputSchema: JSONSchema
}

export type MergedAgentTools<TServerTools extends ReadonlyArray<AnyTool>> =
  ReadonlyArray<TServerTools[number] | ClientToolDeclaration>

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
 * Typing:
 * - Empty `clientTools` preserves the server tuple (closed name union).
 * - Non-empty `clientTools` returns a widened array that honestly includes
 *   client stubs, so `TypedStreamChunk` does not claim a closed server-only
 *   name union.
 *
 * @param serverTools - The server's tool array (e.g. from
 *   `[myToolDef.server(...)]`). Pass directly to `chat({ tools })`.
 * @param clientTools - The `tools` array received from
 *   `chatParamsFromRequest(...)` / `chatParamsFromRequestBody(...)`.
 * @returns A merged array suitable for `chat({ tools })`.
 */
export function mergeAgentTools<
  const TServerTools extends ReadonlyArray<AnyTool>,
>(serverTools: TServerTools, clientTools: readonly []): TServerTools
export function mergeAgentTools<
  const TServerTools extends ReadonlyArray<AnyTool>,
>(
  serverTools: TServerTools,
  clientTools: ReadonlyArray<{
    name: string
    description: string
    parameters: JSONSchema
  }>,
): MergedAgentTools<TServerTools>
export function mergeAgentTools<
  const TServerTools extends ReadonlyArray<AnyTool>,
>(
  serverTools: TServerTools,
  clientTools: ReadonlyArray<{
    name: string
    description: string
    parameters: JSONSchema
  }>,
): TServerTools | MergedAgentTools<TServerTools> {
  if (clientTools.length === 0) {
    return serverTools
  }
  const seen = new Set(serverTools.map((t) => t.name))
  const merged: Array<TServerTools[number] | ClientToolDeclaration> = [
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
    })
  }
  return merged
}
