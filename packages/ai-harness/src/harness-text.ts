import { EventType, uiMessagesToWire } from '@tanstack/ai'
import { createHarnessHost } from './host'
import { acceptedKinds } from './session'
import type {
  AnyTextAdapter,
  Modality,
  ModelMessage,
  StreamChunk,
} from '@tanstack/ai'
import { isHarnessDefinition } from './define'
import type { AnyHarness } from './define'
import type { HarnessHost } from './host'
import type { UserInput } from './types'

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

/** Stream the SSE `data:` payloads of a response. */
async function* sseData(response: Response): AsyncGenerator<unknown> {
  if (!response.body) return
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      const data = block
        .split('\n')
        .find((line) => line.startsWith('data: '))
        ?.slice(6)
      if (data) yield JSON.parse(data)
    }
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
        const threadId = chatOptions.threadId ?? 'default'
        const runId = chatOptions.runId ?? `harness-${Date.now().toString(36)}`
        // AG-UI parts: text parts carry `text`, media parts pass through.
        const [message] = uiMessagesToWire([
          { role: 'user', content: lastUserInput(chatOptions.messages) },
        ])
        const response = await doFetch(`${base}/run`, {
          method: 'POST',
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
        for await (const data of sseData(response)) {
          if (!isRecord(data) || typeof data.type !== 'string') continue
          // The handler sends AG-UI chunks over SSE.
          const chunk = data as StreamChunk
          if (
            FORWARDED.has(chunk.type) &&
            !('subagentRunId' in chunk && chunk.subagentRunId)
          ) {
            yield chunk
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
        yield {
          type: EventType.RUN_FINISHED,
          runId,
          threadId,
          timestamp: Date.now(),
          metadata: { tanstack: { finishReason: 'stop' } },
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
        const threadId = `${chatOptions.threadId ?? 'default'}:${harness.name}`
        const runId = chatOptions.runId ?? `harness-${Date.now().toString(36)}`
        const signal =
          isRecord(chatOptions.request) &&
          chatOptions.request.signal instanceof AbortSignal
            ? chatOptions.request.signal
            : undefined
        const session = await host.open(harness, { threadId })
        const operation = session.prompt(lastUserInput(chatOptions.messages))
        signal?.addEventListener('abort', () => void operation.cancel(), {
          once: true,
        })

        yield {
          type: EventType.RUN_STARTED,
          runId,
          threadId,
          timestamp: Date.now(),
        }
        let failed: string | undefined
        for await (const chunk of operation.stream()) {
          if (
            FORWARDED.has(chunk.type) &&
            !('subagentRunId' in chunk && chunk.subagentRunId)
          ) {
            yield chunk
          }
          if (chunk.type === EventType.RUN_ERROR) failed = chunk.message
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
          metadata: { tanstack: { finishReason: 'stop' } },
        }
      })(),
    structuredOutput: () =>
      Promise.reject(
        new Error('harnessText does not support structured output.'),
      ),
  }
}
