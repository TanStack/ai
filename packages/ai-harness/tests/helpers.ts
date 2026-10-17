import { EventType } from '@tanstack/ai'
import type {
  AnyChatMiddleware,
  AnyTextAdapter,
  ModelMessage,
  StreamChunk,
  WebSocketLike,
} from '@tanstack/ai'
import type { LogStore } from '@tanstack/ai-persistence'
import type { HostFrame } from '../src/protocol'

/**
 * A log store that calls `overrides` for the methods it has, and `inner` for
 * every other method. The object lists each method of {@link LogStore}, so a
 * new method on the interface is a compile error here.
 */
export function wrapLogStore(
  inner: LogStore,
  overrides: Partial<LogStore>,
): LogStore {
  return {
    append: overrides.append ?? inner.append.bind(inner),
    read: overrides.read ?? inner.read.bind(inner),
    subscribe: overrides.subscribe ?? inner.subscribe.bind(inner),
    acquire: overrides.acquire ?? inner.acquire.bind(inner),
    renew: overrides.renew ?? inner.renew.bind(inner),
    release: overrides.release ?? inner.release.bind(inner),
    setAffinity: overrides.setAffinity ?? inner.setAffinity.bind(inner),
    listOrphaned: overrides.listOrphaned ?? inner.listOrphaned.bind(inner),
    offer: overrides.offer ?? inner.offer.bind(inner),
    offered: overrides.offered ?? inner.offered.bind(inner),
    getSnapshot: overrides.getSnapshot ?? inner.getSnapshot.bind(inner),
    putSnapshot: overrides.putSnapshot ?? inner.putSnapshot.bind(inner),
    truncate: overrides.truncate ?? inner.truncate.bind(inner),
    deleteLog: overrides.deleteLog ?? inner.deleteLog.bind(inner),
  }
}

export type Reply = (
  options: any,
) => AsyncIterable<StreamChunk> | Array<StreamChunk>

/** A text adapter whose turns are scripted. Records every call. */
export function mockAdapter(replies: Array<Reply> | Reply) {
  const calls: Array<any> = []
  const adapter: AnyTextAdapter = {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
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
    chatStream: (options: any) => {
      calls.push(options)
      const reply = Array.isArray(replies) ? replies[calls.length - 1] : replies
      const result = reply ? reply(options) : text('')
      return (async function* () {
        yield* result
      })()
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  }
  return { adapter, calls }
}

const now = () => Date.now()

let messageCount = 0

/** One model call that answers with `content`. Each call gets a new message id. */
export function text(content: string): Array<StreamChunk> {
  messageCount += 1
  const m = `m-${messageCount}`
  return [
    {
      type: EventType.RUN_STARTED,
      runId: 'r',
      threadId: 't',
      timestamp: now(),
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: m,
      role: 'assistant',
      timestamp: now(),
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: m,
      delta: content,
      timestamp: now(),
    },
    { type: EventType.TEXT_MESSAGE_END, messageId: m, timestamp: now() },
    {
      type: EventType.RUN_FINISHED,
      runId: 'r',
      threadId: 't',
      timestamp: now(),
      metadata: { tanstack: { finishReason: 'stop' } },
    },
  ]
}

/** One model call that calls a tool. */
export function toolCall(
  name: string,
  args: Record<string, unknown>,
  id = 'call-1',
): Array<StreamChunk> {
  return [
    {
      type: EventType.RUN_STARTED,
      runId: 'r',
      threadId: 't',
      timestamp: now(),
    },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: id,
      toolCallName: name,
      timestamp: now(),
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: id,
      delta: JSON.stringify(args),
      timestamp: now(),
    },
    { type: EventType.TOOL_CALL_END, toolCallId: id, timestamp: now() },
    {
      type: EventType.RUN_FINISHED,
      runId: 'r',
      threadId: 't',
      timestamp: now(),
      metadata: { tanstack: { finishReason: 'tool_calls' } },
    },
  ]
}

/** A reply that waits until the call is aborted, then ends. */
export function untilAborted(): Reply {
  return (options: any) =>
    (async function* () {
      yield {
        type: EventType.RUN_STARTED,
        runId: 'r',
        threadId: 't',
        timestamp: now(),
      }
      const signal: AbortSignal | undefined =
        options.abortController?.signal ?? options.request?.signal
      await new Promise<void>((resolve) => {
        if (!signal || signal.aborted) return resolve()
        signal.addEventListener('abort', () => resolve(), { once: true })
      })
    })()
}

/** A promise you resolve from outside. */
export function gate() {
  let open!: () => void
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { open, opened }
}

/** A reply that waits for `until` before answering with `content`. */
export function after(until: Promise<void>, content: string): Reply {
  return () =>
    (async function* () {
      await until
      yield* text(content)
    })()
}

/** The text of every message the adapter got on call `index`. */
export function messageTexts(call: any): Array<string> {
  return (call.messages as Array<any>).map((message) =>
    typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content),
  )
}

/**
 * The content of each user message that the harness marked as a wake
 * (`metadata.harness.wake`): the session woke for a background job.
 */
export const wakeMessages = (messages: ReadonlyArray<ModelMessage>) =>
  messages
    .filter(
      (message) =>
        message.role === 'user' && message.metadata?.harness?.wake === true,
    )
    .map((message) => message.content)

/**
 * A WebSocket for `handleHarnessSocket`. `sent` has each frame it sent,
 * `closed` each close code. `receive` gives it a frame from the client, and
 * `fail` fires its error event. With `failSend`, each send throws.
 */
export function fakeSocket(options: { failSend?: boolean } = {}) {
  const handlers: Record<string, Array<(event?: any) => void>> = {}
  const sent: Array<HostFrame> = []
  const closed: Array<number | undefined> = []
  const socket: WebSocketLike = {
    send: (data) => {
      if (options.failSend) throw new Error('socket gone')
      sent.push(JSON.parse(data))
    },
    close: (code?: number) => {
      closed.push(code)
      handlers.close?.forEach((handler) => handler())
    },
    addEventListener: (type: string, handler: (event?: any) => void) => {
      ;(handlers[type] ??= []).push(handler)
    },
  }
  const receive = (frame: unknown) =>
    handlers.message?.forEach((handler) =>
      handler({
        data: typeof frame === 'string' ? frame : JSON.stringify(frame),
      }),
    )
  const fail = () => handlers.error?.forEach((handler) => handler())
  return { socket, sent, closed, receive, fail }
}

/**
 * The JSON `data` of each SSE event of `response`, until `until` says stop
 * (then the read is cancelled) or the stream ends.
 */
export async function readSse<T>(
  response: Response,
  until: (frame: T) => boolean,
) {
  if (!response.body) throw new Error('The response has no body.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const frames: Array<T> = []
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
      if (!data) continue
      // The handler writes each frame as JSON.
      const parsed: T = JSON.parse(data)
      frames.push(parsed)
      if (until(parsed)) {
        await reader.cancel()
        return frames
      }
    }
  }
  return frames
}

/**
 * A middleware that sends the model `[hidden]` in place of each message
 * `secret`, at each model call. The transcript keeps `secret`.
 */
export const hideSecret: AnyChatMiddleware = {
  name: 'test/hide-secret',
  onConfig: (ctx, config) => {
    if (ctx.phase !== 'beforeModel') return undefined
    return {
      providerMessages: config.messages.map((message) =>
        message.content === 'secret'
          ? { ...message, content: '[hidden]' }
          : message,
      ),
    }
  },
}
