import { EventType } from '@tanstack/ai'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'

type Reply = (options: any) => AsyncIterable<StreamChunk> | Array<StreamChunk>

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

/** One model call that answers with `content`. */
export function text(content: string): Array<StreamChunk> {
  return [
    {
      type: EventType.RUN_STARTED,
      runId: 'r',
      threadId: 't',
      timestamp: now(),
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'm',
      role: 'assistant',
      timestamp: now(),
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'm',
      delta: content,
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
