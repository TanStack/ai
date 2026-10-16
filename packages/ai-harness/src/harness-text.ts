import { EventType, uiMessagesToWire } from '@tanstack/ai'
import { createHarnessHost } from './host'
import { acceptedKinds } from './session/index'
import type {
  AnyTextAdapter,
  Modality,
  ModelMessage,
  RunFinishedEvent,
  StreamChunk,
} from '@tanstack/ai'
import { isHarnessDefinition } from './define'
import type { AnyHarness } from './define'
import type { HarnessHost } from './host'
import type { Principal, UserInput } from './types'

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
  /** Who opens the inner sessions, as in `host.open()`. */
  principal?: Principal
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** The content of the last user message: its text, or its content parts. */
function lastUserInput(messages: ReadonlyArray<ModelMessage>) {
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

/** The `data:` payload of one SSE block. */
const dataOf = (block: string) =>
  block
    .split(/\r?\n/)
    .find((line) => line.startsWith('data: '))
    ?.slice(6)

/** Stream the SSE `data:` payloads of a response. */
async function* sseData(response: Response): AsyncGenerator<unknown> {
  if (!response.body) return
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // SSE allows CRLF line ends too.
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() ?? ''
      for (const block of blocks) {
        const data = dataOf(block)
        if (data) yield JSON.parse(data)
      }
    }
    // A stream that ends without a blank line still has its last event.
    const last = dataOf(buffer)
    if (last) yield JSON.parse(last)
  } finally {
    // An early return or a failed read stops the body too.
    await reader.cancel().catch(() => {})
  }
}

type FinishReason = NonNullable<RunFinishedEvent['finishReason']>

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
        const response = await doFetch(`${base}/run`, {
          method: 'POST',
          signal: signalOf(chatOptions.request),
          headers: {
            'Content-Type': 'application/json',
            ...(remote.token
              ? { Authorization: `Bearer ${remote.token}` }
              : {}),
          },
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
        let finished: FinishReason | undefined
        for await (const data of sseData(response)) {
          if (!isRecord(data) || typeof data.type !== 'string') continue
          // The handler sends AG-UI chunks over SSE.
          const chunk = data as StreamChunk
          const isOwn = !('subagentRunId' in chunk && chunk.subagentRunId)
          if (FORWARDED.has(chunk.type) && isOwn) yield chunk
          if (chunk.type === EventType.RUN_FINISHED && isOwn) {
            finished = finishReasonOf(chunk)
          }
          if (chunk.type === EventType.RUN_ERROR) {
            yield {
              type: EventType.RUN_ERROR,
              message: chunk.message,
              timestamp: Date.now(),
            }
            return
          }
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
          metadata: { tanstack: { finishReason: finished } },
        }
      })(),
  }
}

/**
 * Use a harness as the model of a `chat()` call, the way you would call a
 * coding agent. Each outer thread gets its own inner session, which keeps
 * its own transcript, tools, plugins, and agents. The inner turn gets the
 * last user message with its content parts (images, audio, video,
 * documents). The outer chat sees the inner turn's text and reasoning.
 *
 * `inputModalities` is what the harness reads: the `inputModalities`
 * option, else its adapter's list, narrowed by `media.accepts`. It is
 * `undefined` for a remote harness.
 *
 * @example
 * ```ts
 * const stream = chat({ adapter: harnessText(studio), messages, threadId })
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
  let host = options.host
  return {
    kind: 'text',
    name: 'harness',
    model: harness.name,
    inputModalities: inputsOf(harness, options.inputModalities),
    '~types': TYPES,
    chatStream: (chatOptions) =>
      (async function* (): AsyncGenerator<StreamChunk> {
        host ??= createHarnessHost()
        const runId = chatOptions.runId ?? `harness-${Date.now().toString(36)}`
        // No thread id: a new inner session per call, as codexText does.
        const threadId = `${chatOptions.threadId ?? runId}:${harness.name}`
        const signal = signalOf(chatOptions.request)
        // A session this call opens closes with it. One the caller holds open
        // stays, as in host.fork.
        const wasOpen = host.isOpen(harness, { threadId })
        const session = await host.open(harness, {
          threadId,
          ...(options.principal ? { principal: options.principal } : {}),
        })
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
          let failed: string | undefined
          let finished: FinishReason = 'stop'
          for await (const chunk of operation.stream()) {
            const isOwn = !('subagentRunId' in chunk && chunk.subagentRunId)
            if (FORWARDED.has(chunk.type) && isOwn) yield chunk
            if (chunk.type === EventType.RUN_FINISHED && isOwn) {
              finished = finishReasonOf(chunk)
            }
            if (chunk.type === EventType.RUN_ERROR) failed = chunk.message
          }
          // A cancel or a store failure ends the turn with no RUN_ERROR.
          try {
            await operation
          } catch (error) {
            failed ??= error instanceof Error ? error.message : String(error)
          }
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
            metadata: { tanstack: { finishReason: finished } },
          }
        } finally {
          // A long-lived signal must not keep one listener per call.
          signal?.removeEventListener('abort', cancel)
          if (!wasOpen)
            await session
              .close()
              .catch((error: unknown) =>
                console.error(
                  '[@tanstack/ai-harness] The session did not close.',
                  error,
                ),
              )
        }
      })(),
    structuredOutput: () =>
      Promise.reject(
        new Error('harnessText does not support structured output.'),
      ),
  }
}
