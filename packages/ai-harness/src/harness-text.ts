import { EventType, fromSpecTokenUsage, uiMessagesToWire } from '@tanstack/ai'
import { createHarnessHost, innerThreadOf, throughOuterThread } from './host'
import { acceptedKinds } from './session/index'
import type {
  AnyTextAdapter,
  Modality,
  ModelMessage,
  RunFinishedEvent,
  StreamChunk,
  TokenUsage,
} from '@tanstack/ai'
import { isHarnessDefinition } from './define'
import type { AnyHarness } from './define'
import type { HarnessHost } from './host'
import type { Operation, HarnessUser, UserInput } from './types'

export interface HarnessTextOptions {
  /** The host that runs the inner sessions. Default: a memory host. */
  host?: HarnessHost
  /**
   * The kinds the inner model reads. Default: the list of the harness
   * `adapter`. Set it for a harness whose plugin picks the model, or that
   * has a `keyedAdapter`: neither list is known until a turn runs.
   * `media.accepts` narrows it.
   */
  inputModalities?: ReadonlyArray<Modality>
  /**
   * Who opens the inner sessions, as in `host.open()`, when the call has no
   * user of its own. Inside a harness turn, the inner session opens as the
   * user of that turn instead. On a `host` with access that has the outer
   * thread too, the inner session is checked through the outer thread, so
   * every user who can read the outer thread can use it.
   */
  user?: HarnessUser
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** The content of the last user message: its text, or its content parts. */
export function lastUserInput(messages: ReadonlyArray<ModelMessage>) {
  const message = messages.findLast((entry) => entry.role === 'user')
  const input: UserInput = message?.content ?? ''
  return input
}

/**
 * What a harness reads: text, plus the kinds its session sends the model
 * (`modalities`, else the adapter's list, narrowed by `media.accepts`).
 * `undefined` when neither is known, so the outer harness sends every kind.
 */
function inputsOf(
  harness: AnyHarness,
  modalities: ReadonlyArray<Modality> | undefined,
) {
  // ponytail: the harness adapter only. A plugin that picks another model at
  // runtime is not seen here, so the caller says it with `inputModalities`.
  // A keyedAdapter has no model until a turn builds it, so it has no list.
  const kinds = acceptedKinds(
    modalities ?? harness.adapter?.inputModalities,
    harness.media?.accepts,
  )
  if (kinds === undefined) return undefined
  const inputs: ReadonlyArray<Modality> = [
    'text',
    ...kinds.filter((kind) => kind !== 'text'),
  ]
  return inputs
}

/** Events of the inner turn that the outer chat shows as its own model output. */
const FORWARDED = new Set<string>([
  EventType.TEXT_MESSAGE_START,
  EventType.TEXT_MESSAGE_CONTENT,
  EventType.TEXT_MESSAGE_END,
  EventType.REASONING_START,
  EventType.REASONING_MESSAGE_START,
  EventType.REASONING_MESSAGE_CONTENT,
  EventType.REASONING_MESSAGE_END,
  EventType.REASONING_END,
])

/** A harness served by `createHarnessHandler` (or `runCli --serve`) on another machine. */
export interface RemoteHarness {
  /** The handler base URL, for example `http://127.0.0.1:8787`. */
  url: string
  /** The bearer token. */
  token?: string
  fetch?: typeof fetch
}

// Type-only fields. Every input kind type-checks, so `chat()` lets callers
// send files. The runtime `inputModalities` says what the harness reads.
const TYPES = {
  providerOptions: {} as Record<string, unknown>,
  inputModalities: ['text', 'image', 'audio', 'video', 'document'] as const,
  messageMetadataByModality: {
    text: undefined as unknown,
    image: undefined as unknown,
    audio: undefined as unknown,
    video: undefined as unknown,
    document: undefined as unknown,
  },
  toolCapabilities: [] as ReadonlyArray<string>,
  toolCallMetadata: undefined as unknown,
  systemPromptMetadata: undefined as never,
}

/**
 * The data of one SSE event (with LF line ends), as the SSE spec reads it:
 * the values of its `data` lines, joined with new lines. One space after
 * `data:` is not part of the value. `undefined` when the event has no data.
 */
function dataOf(block: string) {
  const values = block.split('\n').flatMap((line) => {
    if (line !== 'data' && !line.startsWith('data:')) return []
    const value = line.slice('data:'.length)
    return [value.startsWith(' ') ? value.slice(1) : value]
  })
  return values.length > 0 ? values.join('\n') : undefined
}

/** The SSE line ends (CRLF, CR, or LF) as LF. */
const toLf = (text: string) => text.replace(/\r\n?/g, '\n')

/** Stream the data of each SSE event of a response. */
async function* sseData(response: Response): AsyncGenerator<unknown> {
  if (!response.body) return
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  // The text, with LF line ends, of the event that did not end yet.
  let text = ''
  // A CR at the end of a read can be the first half of a CRLF.
  let carry = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      const read = carry + decoder.decode(value, { stream: true })
      carry = read.endsWith('\r') ? '\r' : ''
      text += toLf(carry ? read.slice(0, -1) : read)
      // A blank line ends an event.
      const blocks = text.split('\n\n')
      text = blocks.pop() ?? ''
      for (const block of blocks) {
        const data = dataOf(block)
        if (data) yield JSON.parse(data)
      }
    }
    // A stream that ends without a blank line still has its last event.
    const last = dataOf(text + toLf(carry + decoder.decode()))
    if (last) yield JSON.parse(last)
  } finally {
    // An early return or a failed read stops the body too.
    await reader.cancel().catch(() => {})
  }
}

/** The usage of an inner RUN_FINISHED, in either form that it can have. */
function usageOf(chunk: RunFinishedEvent) {
  const { usage } = chunk
  if (usage === undefined || Array.isArray(usage)) {
    return fromSpecTokenUsage(usage, chunk.metadata?.tanstack?.usage)
  }
  return usage
}

/** Two counts added up. `undefined` when neither has the count. */
const plus = (a: number | undefined, b: number | undefined) =>
  a === undefined ? b : a + (b ?? 0)

/**
 * The usage of two model calls added up: the token counts, the cached,
 * cache write, and reasoning tokens, and the cost.
 */
function addUsage(total: TokenUsage | undefined, next: TokenUsage) {
  if (total === undefined) return next
  const cachedTokens = plus(
    total.promptTokensDetails?.cachedTokens,
    next.promptTokensDetails?.cachedTokens,
  )
  const cacheWriteTokens = plus(
    total.promptTokensDetails?.cacheWriteTokens,
    next.promptTokensDetails?.cacheWriteTokens,
  )
  const reasoningTokens = plus(
    total.completionTokensDetails?.reasoningTokens,
    next.completionTokensDetails?.reasoningTokens,
  )
  const cost = plus(total.cost, next.cost)
  const hasPromptDetails =
    cachedTokens !== undefined || cacheWriteTokens !== undefined
  const usage: TokenUsage = {
    promptTokens: total.promptTokens + next.promptTokens,
    completionTokens: total.completionTokens + next.completionTokens,
    totalTokens: total.totalTokens + next.totalTokens,
    ...(hasPromptDetails && {
      promptTokensDetails: {
        ...(cachedTokens !== undefined && { cachedTokens }),
        ...(cacheWriteTokens !== undefined && { cacheWriteTokens }),
      },
    }),
    ...(reasoningTokens !== undefined && {
      completionTokensDetails: { reasoningTokens },
    }),
    ...(cost !== undefined && { cost }),
  }
  return usage
}

/**
 * The user and the thread of the harness turn that makes this `chatStream`
 * call. A harness puts its run on the `context` of each chat() call, and the
 * engine gives the adapter its middleware context, with that `context`, as
 * `capabilities`. `undefined` outside a harness. The user is
 * `undefined` for a run with no user.
 */
function outerRunOf(capabilities: unknown) {
  if (!isRecord(capabilities) || !isRecord(capabilities.context)) {
    return undefined
  }
  const { run } = capabilities.context
  if (!isRecord(run) || typeof run.threadId !== 'string') return undefined
  return {
    threadId: run.threadId,
    user: isUser(run.user) ? run.user : undefined,
  }
}

// ponytail: the harness sets `run.user`. An id tells it apart. The
// object passes on as is, with its `name` and the fields of a custom type.
function isUser(value: unknown): value is HarnessUser {
  return isRecord(value) && typeof value.id === 'string'
}

export type FinishReason = NonNullable<RunFinishedEvent['finishReason']>

/**
 * The finish reason of an inner RUN_FINISHED. An interrupted inner turn
 * stopped for an answer the outer chat cannot give, so it is not a `'stop'`:
 * the outer run gets `'tool_calls'`, as a turn that waits on a tool does.
 */
function finishReasonOf(chunk: RunFinishedEvent): FinishReason {
  if (chunk.outcome?.type === 'interrupt') return 'tool_calls'
  return chunk.finishReason ?? chunk.metadata?.tanstack?.finishReason ?? 'stop'
}

/** The abort signal of a `chatStream` call, if the caller gave one. */
function signalOf(request: unknown) {
  return isRecord(request) && request.signal instanceof AbortSignal
    ? request.signal
    : undefined
}

/** How one inner turn ended. See {@link forwardTurn}. */
export interface InnerTurnEnd {
  /** The error text of a turn that failed or was cancelled. */
  failed?: string
  finished: FinishReason
  /** The turn stopped for waits: approvals, client tools, or questions. */
  isInterrupted: boolean
  /** The usage of the turn's model calls, with its child agents. */
  usage?: TokenUsage
}

/**
 * Stream the chunks of an inner turn that `pass` keeps, and return how the
 * turn ended. `finished` is `undefined` when no RUN_FINISHED of the turn
 * came. `pass` gets each chunk, and whether the turn itself sent it (not a
 * child run of the turn).
 */
async function* forwardChunks(
  chunks: AsyncIterable<StreamChunk>,
  pass: (chunk: StreamChunk, isOwn: boolean) => StreamChunk | undefined,
): AsyncGenerator<
  StreamChunk,
  Omit<InnerTurnEnd, 'finished'> & { finished?: FinishReason }
> {
  let failed: string | undefined
  let finished: FinishReason | undefined
  let isInterrupted = false
  let usage: TokenUsage | undefined
  for await (const chunk of chunks) {
    const isOwn = !('subagentRunId' in chunk && chunk.subagentRunId)
    const kept = pass(chunk, isOwn)
    if (kept) yield kept
    if (chunk.type === EventType.RUN_FINISHED && isOwn) {
      finished = finishReasonOf(chunk)
      isInterrupted = chunk.outcome?.type === 'interrupt'
      // It has the usage of the child agents of the call too.
      const used = usageOf(chunk)
      if (used) usage = addUsage(usage, used)
    }
    if (chunk.type === EventType.RUN_ERROR) failed = chunk.message
  }
  return {
    ...(failed !== undefined && { failed }),
    ...(finished !== undefined && { finished }),
    isInterrupted,
    ...(usage && { usage }),
  }
}

/**
 * @internal Stream the events of the inner turn `operation` that `pass`
 * keeps, and return how the turn ended. `pass` gets each event, and whether
 * the turn itself sent it (not a child run of the turn). `harnessText` and
 * `harnessAgent` share it.
 */
export async function* forwardTurn(
  operation: Operation<unknown>,
  pass: (chunk: StreamChunk, isOwn: boolean) => StreamChunk | undefined,
): AsyncGenerator<StreamChunk, InnerTurnEnd> {
  const end = yield* forwardChunks(operation.stream(), pass)
  let { failed } = end
  // A cancel or a store failure ends the turn with no RUN_ERROR.
  try {
    await operation
  } catch (error) {
    failed ??= error instanceof Error ? error.message : String(error)
  }
  return {
    ...end,
    ...(failed !== undefined && { failed }),
    finished: end.finished ?? 'stop',
  }
}

function remoteHarnessText(remote: RemoteHarness): AnyTextAdapter {
  const base = remote.url.replace(/\/$/, '')
  const doFetch = remote.fetch ?? fetch
  // No runtime `inputModalities`: the model of the remote harness is not
  // known here, so the outer harness sends every kind.
  return {
    kind: 'text',
    name: 'harness-remote',
    model: base,
    '~types': TYPES,
    structuredOutput: () =>
      Promise.reject(
        new Error('harnessText does not support structured output.'),
      ),
    chatStream: (chatOptions) =>
      (async function* (): AsyncGenerator<StreamChunk> {
        const runId = chatOptions.runId ?? `harness-${Date.now().toString(36)}`
        // No thread id: a new remote session per call, as codexText does.
        const threadId = chatOptions.threadId ?? runId
        // AG-UI parts: text parts carry `text`, media parts pass through.
        const [message] = uiMessagesToWire([
          { role: 'user', content: lastUserInput(chatOptions.messages) },
        ])
        const headers = {
          'Content-Type': 'application/json',
          ...(remote.token ? { Authorization: `Bearer ${remote.token}` } : {}),
        }
        const signal = signalOf(chatOptions.request)
        // The remote turn runs as `runId`. An abort stops the fetch, and the
        // remote turn too: else it runs to its end on the remote host.
        const cancelRemote = () => {
          doFetch(`${base}/control`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              threadId,
              input: { op: 'cancel', operationId: runId },
            }),
          }).catch(() => {})
        }
        signal?.addEventListener('abort', cancelRemote, { once: true })
        try {
          const response = await doFetch(`${base}/run`, {
            method: 'POST',
            signal,
            headers,
            body: JSON.stringify({
              threadId,
              runId,
              // The remote session keeps its own history, so send the new message only.
              messages: [{ ...message, id: `${runId}-user` }],
              tools: [],
              context: [],
              state: {},
              forwardedProps: {},
            }),
          })
          if (!response.ok) {
            throw new Error(
              `Remote harness failed (${response.status}): ${await response.text()}`,
            )
          }
          yield {
            type: EventType.RUN_STARTED,
            runId,
            threadId,
            timestamp: Date.now(),
          }
          async function* remoteChunks() {
            for await (const data of sseData(response)) {
              // The handler sends AG-UI chunks over SSE.
              if (!isRecord(data) || typeof data.type !== 'string') continue
              const chunk = data as StreamChunk
              yield chunk
              // A run error ends the remote call. Later data is not read.
              if (chunk.type === EventType.RUN_ERROR) return
            }
          }
          const { failed, finished, usage } = yield* forwardChunks(
            remoteChunks(),
            (chunk, isOwn) =>
              FORWARDED.has(chunk.type) && isOwn ? chunk : undefined,
          )
          if (failed !== undefined) {
            yield {
              type: EventType.RUN_ERROR,
              message: failed,
              timestamp: Date.now(),
            }
            return
          }
          // A stream that ends with no RUN_FINISHED lost the end of the run.
          if (finished === undefined) {
            yield {
              type: EventType.RUN_ERROR,
              message:
                'The remote harness closed the stream before the run ended.',
              timestamp: Date.now(),
            }
            return
          }
          yield {
            type: EventType.RUN_FINISHED,
            runId,
            threadId,
            timestamp: Date.now(),
            ...(usage && { usage }),
            metadata: { tanstack: { finishReason: finished } },
          }
        } finally {
          // A long-lived signal must not keep one listener per call.
          signal?.removeEventListener('abort', cancelRemote)
        }
      })(),
  }
}

/**
 * Use a harness as the model of a `chat()` call, the way you would call a
 * coding agent. Each outer thread gets its own inner session, which keeps
 * its own transcript, tools, plugins, and agents. The inner turn gets the
 * last user message with its content parts (images, audio, video,
 * documents). The outer chat sees the inner turn's text and reasoning, and
 * the outer run gets the token usage of the inner model calls.
 *
 * Inside a harness turn, the inner session opens as the user of that turn.
 * Else it opens as `options.user`. The inner thread is
 * `<outer thread>/inner/<harness name>`. On a host with access that has the
 * outer thread too, the inner session is checked through the outer thread:
 * every user who can read the outer thread can use it. An abort of the call
 * cancels the inner turn. For a remote harness, it also sends a cancel to the remote
 * host, so the remote turn stops too.
 *
 * `inputModalities` is what the harness reads: the `inputModalities`
 * option, else its adapter's list, narrowed by `media.accepts`. It is
 * `undefined` for a remote harness.
 *
 * @example
 * ```ts
 * const stream = chat({ adapter: harnessText(studio), messages, threadId })
 * const remote = harnessText({ url: 'http://127.0.0.1:8787', token })
 * ```
 */
export function harnessText(
  harness: AnyHarness,
  options?: HarnessTextOptions,
): AnyTextAdapter
export function harnessText(remote: RemoteHarness): AnyTextAdapter
export function harnessText(
  target: AnyHarness | RemoteHarness,
  options: HarnessTextOptions = {},
): AnyTextAdapter {
  if (!isHarnessDefinition(target)) return remoteHarnessText(target)
  const harness = target
  const { inputModalities } = options
  let { host } = options
  return {
    kind: 'text',
    name: 'harness',
    model: harness.name,
    inputModalities: inputsOf(harness, inputModalities),
    '~types': TYPES,
    chatStream: (chatOptions) =>
      (async function* (): AsyncGenerator<StreamChunk> {
        host ??= createHarnessHost()
        const runId = chatOptions.runId ?? `harness-${Date.now().toString(36)}`
        // The inner thread belongs to the outer one. On a host with access,
        // it is checked through the outer thread (see `throughOuterThread`).
        const outer = outerRunOf(chatOptions.capabilities)
        // No thread id: a new inner session per call, as codexText does.
        const outerThread = outer?.threadId ?? chatOptions.threadId ?? runId
        const threadId = innerThreadOf(outerThread, harness.name)
        const signal = signalOf(chatOptions.request)
        // The call releases its handle at the end. The session then closes
        // on idle, unless another handle holds it too. Inside a harness turn
        // it opens as the user of that turn, so each call has its own user.
        const user = outer?.user ?? options.user
        const session = await host.open(
          harness,
          throughOuterThread(
            { threadId, ...(user ? { user } : {}) },
            outerThread,
          ),
        )
        // The outer call's tools join the inner turn. Its system prompts do
        // not: the harness owns its prompt stack.
        const tools = chatOptions.tools?.length
          ? { overrides: { tools: chatOptions.tools } }
          : {}
        const operation = session.send(
          lastUserInput(chatOptions.messages),
          tools,
        )
        const cancel = () => {
          operation.cancel().catch(() => {})
        }
        // A signal that aborted already never fires its event.
        if (signal?.aborted) cancel()
        else signal?.addEventListener('abort', cancel, { once: true })
        try {
          yield {
            type: EventType.RUN_STARTED,
            runId,
            threadId,
            timestamp: Date.now(),
          }
          const { failed, finished, usage } = yield* forwardTurn(
            operation,
            (chunk, isOwn) =>
              FORWARDED.has(chunk.type) && isOwn ? chunk : undefined,
          )
          if (failed !== undefined) {
            yield {
              type: EventType.RUN_ERROR,
              message: failed,
              timestamp: Date.now(),
            }
            return
          }
          yield {
            type: EventType.RUN_FINISHED,
            runId,
            threadId,
            timestamp: Date.now(),
            // The outer run counts the tokens of the inner model calls.
            ...(usage && { usage }),
            metadata: { tanstack: { finishReason: finished } },
          }
        } finally {
          // A long-lived signal must not keep one listener per call.
          signal?.removeEventListener('abort', cancel)
          await session.close()
        }
      })(),
    structuredOutput: () =>
      Promise.reject(
        new Error('harnessText does not support structured output.'),
      ),
  }
}
