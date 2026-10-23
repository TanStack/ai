import type {
  Interrupt,
  JSONSchema,
  ModelMessage,
  RunAgentResumeItem,
  StreamChunk,
} from '@tanstack/ai'
import type { AgentEvent } from '@earendil-works/pi-agent-core'
import type { Message } from '@earendil-works/pi-ai'
import { fromPiMessages } from './messages'

/**
 * A `chat()` interrupt for a pi client: a tool approval, a client tool to run,
 * or another pause. Answer each interrupt with a `resume` entry, and send
 * `runId` back as `parentRunId`.
 */
export interface TanStackInterruptMessage {
  role: 'tanstack-interrupt'
  /** The paused run. */
  runId: string
  interrupts: Array<Interrupt>
  timestamp: number
}

/**
 * A `chat()` event that has no pi event: state, activity, steps, custom
 * events, and the events of subagents.
 */
export interface TanStackEventMessage {
  role: 'tanstack-event'
  event: StreamChunk
  timestamp: number
}

/** The pi messages that carry `chat()` data that pi has no type for. */
export type TanStackPiMessage = TanStackInterruptMessage | TanStackEventMessage

/** A pi agent event, or the start or end of a {@link TanStackPiMessage}. */
export type PiBridgeEvent =
  | AgentEvent
  | { type: 'message_start' | 'message_end'; message: TanStackPiMessage }

/** A tool that the pi client runs, as `chat()` reads it. */
export interface PiClientTool {
  name: string
  description: string
  parameters: JSONSchema
}

/** What `chat()` needs from a pi client request. */
export interface PiChatParams {
  threadId: string
  messages: Array<ModelMessage>
  /** The tools that the pi client runs. */
  tools?: Array<PiClientTool>
  /** The answers to the interrupts of the paused run. */
  resume?: Array<RunAgentResumeItem>
  /** The paused run, with `resume`. */
  parentRunId?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTextOrImage(part: unknown): boolean {
  if (!isRecord(part)) return false
  if (part.type === 'text') return typeof part.text === 'string'
  return (
    part.type === 'image' &&
    typeof part.data === 'string' &&
    typeof part.mimeType === 'string'
  )
}

/** A structural check of one pi message. Other roles are app messages. */
function isValidMessage(value: unknown): boolean {
  if (!isRecord(value) || typeof value.role !== 'string') return false
  const { content } = value
  switch (value.role) {
    case 'system':
    case 'user':
      return (
        typeof content === 'string' ||
        (Array.isArray(content) && content.every(isTextOrImage))
      )
    case 'toolResult':
      return (
        typeof value.toolCallId === 'string' &&
        typeof value.isError === 'boolean' &&
        Array.isArray(content) &&
        content.every(isTextOrImage)
      )
    case 'assistant':
      return (
        Array.isArray(content) &&
        content.every(
          (part) =>
            isRecord(part) &&
            ((part.type === 'text' && typeof part.text === 'string') ||
              (part.type === 'thinking' && typeof part.thinking === 'string') ||
              (part.type === 'toolCall' &&
                typeof part.id === 'string' &&
                typeof part.name === 'string' &&
                isRecord(part.arguments))),
        )
      )
    default:
      return true
  }
}

function isMessageList(value: unknown): value is Array<Message> {
  return Array.isArray(value) && value.every(isValidMessage)
}

function isResumeItem(value: unknown): value is RunAgentResumeItem {
  return (
    isRecord(value) &&
    typeof value.interruptId === 'string' &&
    (value.status === 'resolved' || value.status === 'cancelled')
  )
}

function isClientTool(value: unknown): value is PiClientTool {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    isRecord(value.parameters)
  )
}

/**
 * Read the body that a pi client posts as `chat()` params:
 * `chat({ adapter, systemPrompts, ...params })`.
 *
 * The body is `{ threadId, messages, tools?, resume?, parentRunId? }`, with
 * pi messages and pi tools. The system messages of the client are dropped,
 * so the server sets the system prompt. When `parentRunId` is missing, it is
 * the `runId` of the last `tanstack-interrupt` message in `messages`.
 *
 * @throws An error when the body or a message does not have the pi shape.
 */
export function chatParamsFromPiRequestBody(body: unknown): PiChatParams {
  if (!isRecord(body) || typeof body.threadId !== 'string') {
    throw new Error('The body must have a `threadId`.')
  }
  if (!isMessageList(body.messages)) {
    throw new Error('The body must have pi `messages`.')
  }
  const { tools, resume, parentRunId } = body
  if (
    tools !== undefined &&
    !(Array.isArray(tools) && tools.every(isClientTool))
  )
    throw new Error('`tools` must be pi tools.')
  if (
    resume !== undefined &&
    !(Array.isArray(resume) && resume.every(isResumeItem))
  )
    throw new Error('`resume` must be AG-UI resume entries.')
  if (parentRunId !== undefined && typeof parentRunId !== 'string')
    throw new Error('`parentRunId` must be a string.')

  const raw: ReadonlyArray<unknown> = body.messages
  const lastInterrupt = raw.findLast(
    (message) => isRecord(message) && message.role === 'tanstack-interrupt',
  )
  const pausedRunId =
    parentRunId ??
    (isRecord(lastInterrupt) && typeof lastInterrupt.runId === 'string'
      ? lastInterrupt.runId
      : undefined)

  return {
    threadId: body.threadId,
    messages: fromPiMessages(body.messages).messages,
    ...(tools !== undefined && tools.length > 0 && { tools }),
    ...(resume !== undefined &&
      resume.length > 0 && {
        resume,
        ...(pausedRunId !== undefined && { parentRunId: pausedRunId }),
      }),
  }
}

/**
 * Read a pi client request as `chat()` params. See
 * {@link chatParamsFromPiRequestBody}.
 *
 * @throws {Response} 400 when the body is not JSON or not a pi chat request.
 */
export async function chatParamsFromPiRequest(
  request: Request,
): Promise<PiChatParams> {
  try {
    return chatParamsFromPiRequestBody(await request.json())
  } catch (cause) {
    // Keep the details on `cause` for server logs, not in the response.
    throw Object.assign(
      new Response('Invalid pi chat request body.', { status: 400 }),
      { cause },
    )
  }
}
