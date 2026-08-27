import { AGUIError } from '@ag-ui/core'
import type {
  Context as AGUIContext,
  Message as AGUIMessage,
  Role as AGUIRole,
} from '@ag-ui/core'
import type {
  AnyTool,
  JSONSchema,
  ModelMessage,
  RunAgentResumeItem,
  UIMessage,
} from '../types'

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
    case 'user': {
      const isInvalidContent =
        typeof value.content !== 'string' && !Array.isArray(value.content)
      if (isInvalidContent) {
        invalidBody(
          `${at}.content must be a string or an array of content parts`,
        )
      }
      break
    }
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

  if (value.metadata !== undefined) {
    if (!isRecord(value.metadata)) {
      invalidBody(`${at}.metadata must be an object`)
    }
  }

  return dropInboundParts(value)
}

function dropInboundParts(
  message: AGUIMessage & { parts?: unknown },
): AGUIMessage {
  if (!('parts' in message)) return message
  const rest = { ...message }
  delete rest.parts
  return rest
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

function validateResumeEntry(
  value: unknown,
  index: number,
): RunAgentResumeItem {
  const at = `resume[${index}]`
  if (!isRecord(value)) invalidBody(`${at} must be an object`)
  const status = value.status
  const hasResolved = status !== 'resolved' && status !== 'cancelled'
  if (hasResolved) {
    invalidBody(`${at}.status must be "resolved" or "cancelled"`)
  }
  const entry: RunAgentResumeItem = {
    interruptId: requireString(value.interruptId, `${at}.interruptId`),
    status,
  }
  // Omit the key entirely when absent, matching the optional-field shape the
  // schema produced.
  if (value.payload !== undefined) entry.payload = value.payload
  if (value.metadata !== undefined) {
    if (!isRecord(value.metadata)) {
      invalidBody(`${at}.metadata must be an object`)
    }
    entry.metadata = value.metadata
  }
  return entry
}

export async function chatParamsFromRequestBody(body: unknown): Promise<{
  messages: Array<UIMessage | ModelMessage>
  threadId: string
  runId: string
  parentRunId?: string
  tools: Array<{ name: string; description: string; parameters: JSONSchema }>
  forwardedProps: Record<string, unknown>
  state: unknown
  resume?: Array<RunAgentResumeItem>
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

  const hasBody =
    body.forwardedProps !== undefined && !isRecord(body.forwardedProps)
  if (hasBody) {
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
    const res = new Response(
      'Invalid AG-UI request body. See docs/migration/ag-ui-compliance.md.',
      { status: 400 },
    )
    ;(res as { cause?: unknown }).cause = cause
    throw res
  }
}

export type ClientToolDeclaration = {
  name: string
  description: string
  inputSchema: JSONSchema
}

export type MergedAgentTools<TServerTools extends ReadonlyArray<AnyTool>> =
  ReadonlyArray<TServerTools[number] | ClientToolDeclaration>

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
