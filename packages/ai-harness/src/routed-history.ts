import { textOf } from './first-party/session-tools'
import { isHumanTarget } from './log-records'
import { isRecord } from './utils'
import type {
  AnyChatMiddleware,
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  ModelMessage,
} from '@tanstack/ai'
import type { HarnessRouting } from './define'

/** A routed child of a run: the agent that answered, and its transcript id. */
type RoutedChild = { name: string; subagentRunId: string }

/** Where the routed runs of a thread and their transcripts come from. */
interface HistorySource {
  mode: NonNullable<HarnessRouting['history']>
  /** The name of the handoff tool. `'handoff'` when not set. */
  handoffToolName?: string
  /** The routed children of run `runId`, in order. */
  childrenOf: (runId: string) => Array<RoutedChild>
  /** The stored transcript of one routed child. */
  transcriptOf: (subagentRunId: string) => Promise<Array<ModelMessage>>
  /**
   * True for a message of the shared thread. An assistant message that is
   * not (the messages of the current chat, or of a resumed run) stays as it
   * is. Every message counts when not set.
   */
  isThreadMessage?: (message: ModelMessage) => boolean
}

/** The run id of a routed host message: `metadata.tanstack.runId`. */
export function routedRunId(message: ModelMessage) {
  const tanstack = message.metadata?.tanstack
  return isRecord(tanstack) && typeof tanstack.runId === 'string'
    ? tanstack.runId
    : undefined
}

/**
 * The run id of a routed pass. An earlier pass of a run with several passes
 * keeps it in `metadata.harness.routedRunId`, because its `tanstack.runId`
 * is gone. The last pass has `metadata.tanstack.runId`.
 */
function passRunId(message: ModelMessage) {
  const harness = message.metadata?.harness
  return isRecord(harness) && typeof harness.routedRunId === 'string'
    ? harness.routedRunId
    : routedRunId(message)
}

/** The root agent that wrote a message: `metadata.harness.agent`. */
export function routedAgent(message: ModelMessage) {
  const harness = message.metadata?.harness
  return isRecord(harness) && typeof harness.agent === 'string'
    ? harness.agent
    : undefined
}

/** True for a router or code handoff note: `metadata.harness.handoff`. */
export function isHandoffNote(message: ModelMessage) {
  const harness = message.metadata?.harness
  return isRecord(harness) && harness.handoff !== undefined
}

/** The line that tells a reader about one handoff call. */
function handoffLine(from: string, args: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(args)
  } catch {
    parsed = undefined
  }
  if (!isRecord(parsed)) return `${from} handed off.`
  const { to, note } = parsed
  const target = isHumanTarget(to) ? 'a person' : to
  const head =
    typeof target === 'string'
      ? `${from} handed off to ${target}.`
      : `${from} handed off.`
  return typeof note === 'string' ? `${head} Note: ${note}` : head
}

/** The note a custom handoff tool recorded on this call, when it set one. */
function recordedHandoffNote(message: ModelMessage) {
  const harness = message.metadata?.harness
  return isRecord(harness) && typeof harness.handoffNote === 'string'
    ? harness.handoffNote
    : undefined
}

/** `args` with `note` set, so a fold reads the recorded note. */
function argumentsWithNote(args: string, note: string) {
  try {
    const parsed = JSON.parse(args)
    if (!isRecord(parsed)) return JSON.stringify({ note })
    if (parsed.note === note) return args
    return JSON.stringify({ ...parsed, note })
  } catch {
    return JSON.stringify({ note })
  }
}

/** The joined text of the assistant messages of a transcript. */
function assistantText(messages: ReadonlyArray<ModelMessage>) {
  return messages
    .filter((message) => message.role === 'assistant')
    .map((message) => textOf(message).trim())
    .filter((text) => text !== '')
    .join('\n\n')
}

/**
 * The messages of a routed child for the model: its transcript without the
 * task it started from, and without an empty placeholder message.
 */
function childMessages(transcript: Array<ModelMessage>) {
  const rest = transcript[0]?.role === 'user' ? transcript.slice(1) : transcript
  return rest.filter(
    (message) =>
      message.role !== 'assistant' ||
      textOf(message) !== '' ||
      (message.toolCalls?.length ?? 0) > 0,
  )
}

/**
 * The text of another speaker as one user message, with the id and the
 * metadata of the message it replaces. A user message: the words are not
 * the reader's own, and the context still ends on a user turn after a
 * handoff (some models, new Claude models among them, reject a context that
 * ends on an assistant message). The fields of an assistant message
 * (thinking, tool calls) do not go with it.
 */
function otherSpeaker(message: ModelMessage | undefined, content: string) {
  const user: ModelMessage = {
    ...(message?.id !== undefined && { id: message.id }),
    ...(message?.metadata !== undefined && { metadata: message.metadata }),
    role: 'user',
    content,
  }
  return user
}

/**
 * Replace a routed host message with the transcripts of its children. A
 * child that `wanted` picks comes in full. Another child comes as its
 * `name:\ntext`. Undefined when no picked child has a stored transcript.
 */
async function expandHost(
  message: ModelMessage,
  children: Array<RoutedChild>,
  wanted: (name: string) => boolean,
  transcriptOf: HistorySource['transcriptOf'],
) {
  // A host message of one agent holds only that agent's pass of the run.
  const agent = routedAgent(message)
  const own =
    agent === undefined
      ? children
      : children.filter((child) => child.name === agent)
  if (!own.some((child) => wanted(child.name))) return undefined
  const parts: Array<ModelMessage> = []
  let expanded = false
  for (const child of own) {
    const body = childMessages(await transcriptOf(child.subagentRunId))
    if (wanted(child.name) && body.length > 0) {
      parts.push(...body)
      expanded = true
      continue
    }
    const text = assistantText(body)
    if (text !== '') {
      parts.push(otherSpeaker(undefined, `${child.name}:\n${text}`))
    }
  }
  return expanded ? parts : undefined
}

/**
 * Fold one message of the thread for `speaker` (`null` for the main model)
 * in `'own'` mode. A message of the speaker stays. A message of another
 * speaker becomes text in one user message, so the speaker does not read
 * it as its own: the main model's text as `main:\ntext`, a routed answer
 * as its `name:\ntext`, and each handoff call as one line. Other tool calls
 * of another speaker go. `folded` collects the ids of the tool calls that
 * this removes, so their results go too.
 */
function foldFor(
  message: ModelMessage,
  speaker: string | null,
  handoffToolName: string,
  folded: Set<string>,
) {
  if (message.role === 'tool') {
    const answersFolded =
      message.toolCallId !== undefined && folded.has(message.toolCallId)
    return answersFolded ? [] : [message]
  }
  // A note names the agent that handed off. A router note of the main
  // model names none.
  const owner = routedAgent(message) ?? null
  if (message.role !== 'assistant' || owner === speaker) return [message]
  const isNote = isHandoffNote(message)
  const from = owner ?? 'main'
  const text = textOf(message).trim()
  const lines: Array<string> = []
  const calls = message.toolCalls ?? []
  if (isNote && calls.length === 0 && text !== '') {
    // A plain note (no handoff tool): its text says who answers next.
    lines.push(text)
  } else if (!isNote && text !== '') {
    // A routed answer has its `name:` label already.
    lines.push(owner === null ? `main:\n${text}` : text)
  }
  for (const call of message.toolCalls ?? []) {
    folded.add(call.id)
    // A note pair always uses the built-in tool name.
    if (isNote || call.function.name === handoffToolName) {
      // A custom handoff tool can record a different note than the model
      // put in the call. The target reads that note; the stored call stays.
      const stamped = isNote ? undefined : recordedHandoffNote(message)
      lines.push(
        handoffLine(
          from,
          stamped === undefined
            ? call.function.arguments
            : argumentsWithNote(call.function.arguments, stamped),
        ),
      )
    }
  }
  return lines.length === 0 ? [] : [otherSpeaker(message, lines.join('\n\n'))]
}

/**
 * The history that `speaker` sees (`null` for the main model).
 *
 * - `'text'`: the messages as they are.
 * - `'all'`: every routed host message becomes the transcripts of its run.
 * - `'own'`: each speaker gets its own messages and its own routed runs in
 *   full, and the words of the other speakers as labeled text.
 */
export async function historyFor(
  options: HistorySource & {
    messages: Array<ModelMessage>
    speaker: string | null
  },
) {
  const { messages, speaker, mode, childrenOf, transcriptOf } = options
  if (mode === 'text') return messages
  const handoffToolName = options.handoffToolName ?? 'handoff'
  const wanted = (name: string) => mode === 'all' || name === speaker
  const folded = new Set<string>()
  const result: Array<ModelMessage> = []
  for (const message of messages) {
    const isOutsideThread =
      message.role === 'assistant' &&
      options.isThreadMessage?.(message) === false
    if (isOutsideThread) {
      result.push(message)
      continue
    }
    const runId = passRunId(message)
    const children =
      message.role === 'assistant' && runId !== undefined
        ? childrenOf(runId)
        : []
    const expanded =
      children.length > 0
        ? await expandHost(message, children, wanted, transcriptOf)
        : undefined
    if (expanded) result.push(...expanded)
    else if (mode === 'all') result.push(message)
    else result.push(...foldFor(message, speaker, handoffToolName, folded))
  }
  return result
}

/**
 * Middleware that gives each routed root agent its history for
 * `routing.history`. It sets `providerMessages`, so the stored thread does
 * not change. A nested child of a root agent keeps its own messages.
 */
export function routedHistoryMiddleware(options: HistorySource) {
  return {
    name: 'harness:routed-history',
    onConfig: async (
      ctx: Pick<ChatMiddlewareContext, 'subagentName' | 'parentSubagentRunId'>,
      config: Pick<ChatMiddlewareConfig, 'messages' | 'providerMessages'>,
    ) => {
      if (options.mode === 'text' || ctx.parentSubagentRunId !== undefined) {
        return undefined
      }
      const source = config.providerMessages ?? config.messages
      const providerMessages = await historyFor({
        ...options,
        messages: source,
        speaker: ctx.subagentName ?? null,
      })
      const isSame =
        providerMessages.length === source.length &&
        providerMessages.every((message, index) => message === source[index])
      return isSame ? undefined : { providerMessages }
    },
  } satisfies AnyChatMiddleware
}
