import { Readable } from 'node:stream'
import { EventType } from '@tanstack/ai'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'

const now = () => Date.now()

/** The chunks of a model call that answers `text`. */
export const textTurn = (text: string): Array<StreamChunk> => [
  { type: EventType.RUN_STARTED, runId: 'r', threadId: 't', timestamp: now() },
  {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'm',
    role: 'assistant',
    timestamp: now(),
  },
  {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'm',
    delta: text,
    timestamp: now(),
  },
  { type: EventType.TEXT_MESSAGE_END, messageId: 'm', timestamp: now() },
  {
    type: EventType.RUN_FINISHED,
    runId: 'r',
    threadId: 't',
    timestamp: now(),
    metadata: { tanstack: { finishReason: 'stop' } },
  },
]

/** The chunks of a model call that calls the tool `name` with `args`. */
export const toolTurn = (name: string, args: string): Array<StreamChunk> => [
  { type: EventType.RUN_STARTED, runId: 'r', threadId: 't', timestamp: now() },
  {
    type: EventType.TOOL_CALL_START,
    toolCallId: 'call_1',
    toolCallName: name,
    timestamp: now(),
  },
  {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 'call_1',
    delta: args,
    timestamp: now(),
  },
  { type: EventType.TOOL_CALL_END, toolCallId: 'call_1', timestamp: now() },
  {
    type: EventType.RUN_FINISHED,
    runId: 'r',
    threadId: 't',
    timestamp: now(),
    metadata: { tanstack: { finishReason: 'tool_calls' } },
  },
]

/** A model call that the test drives. It gets the abort signal of the call. */
type LiveTurn = (signal: AbortSignal | undefined) => AsyncIterable<StreamChunk>

/** A promise that the test resolves with `open`. */
export function gate() {
  let open = () => {}
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { open, opened }
}

/** Resolves when `signal` aborts. Never resolves without a signal. */
function whenAborted(signal: AbortSignal | undefined) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) resolve()
    signal?.addEventListener('abort', () => resolve(), { once: true })
  })
}

/**
 * A model call that streams `text`, then holds until `release` resolves or
 * the call is aborted (a cancel). Then it ends.
 */
export function heldTurn(text: string, release: Promise<void>): LiveTurn {
  const chunks = textTurn(text)
  return async function* (signal) {
    yield* chunks.slice(0, 3)
    await Promise.race([release, whenAborted(signal)])
    yield* chunks.slice(3)
  }
}

/**
 * A model that answers each call with the next of `turns`, and keeps the
 * messages of each call in `seen`.
 */
export function scripted(turns: Array<Array<StreamChunk> | LiveTurn>) {
  let call = 0
  const seen: Array<Array<{ role: string; content: unknown }>> = []
  const adapter: AnyTextAdapter = {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    // `~types` holds types only. Its values are never read, so they are casts.
    '~types': {
      providerOptions: {} as Record<string, unknown>,
      inputModalities: ['text'] as readonly ['text'],
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
    },
    chatStream: (options) => {
      seen.push(options.messages)
      const turn = turns[call] ?? textTurn('')
      call += 1
      if (typeof turn === 'function') {
        return turn(
          options.abortController?.signal ??
            options.request?.signal ??
            undefined,
        )
      }
      return (async function* () {
        yield* turn
      })()
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  }
  return { adapter, seen }
}

/** An stdout or stderr that keeps what is written. */
export function capture() {
  let text = ''
  return {
    write: (chunk: string) => (text += chunk),
    get text() {
      return text
    },
  }
}

/** `stream` as the stdin of runCli, as a terminal or as a pipe. */
export function asStdin(stream: Readable, { isTTY }: { isTTY: boolean }) {
  // NodeJS.ReadStream is a TTY socket. A test cannot make one without a real
  // terminal, and runCli only reads the lines and `isTTY`, so this casts.
  return Object.assign(stream, { isTTY }) as unknown as NodeJS.ReadStream
}

/** A stdin that reads `lines`, as a terminal or as a pipe. */
export function stdinFrom(lines: Array<string>, options: { isTTY: boolean }) {
  return asStdin(Readable.from(lines), options)
}
