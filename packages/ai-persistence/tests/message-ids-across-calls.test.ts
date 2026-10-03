import { describe, expect, it } from 'vitest'
import {
  EventType,
  StreamProcessor,
  chat,
  chatParamsFromRequestBody,
  uiMessagesToWire,
} from '@tanstack/ai'
import type {
  AdapterYieldChunk,
  AnyTextAdapter,
  ModelMessage,
  StreamChunk,
  UIMessage,
} from '@tanstack/ai'
import { memoryPersistence } from '../src/memory'
import { withPersistence } from '../src/middleware'
import { threadMessages } from './persistence-fixtures'

function mockAdapter(iterations: Array<Array<AdapterYieldChunk>>) {
  const prompts: Array<Array<ModelMessage>> = []
  let i = 0
  const adapter = {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    '~types': {},
    chatStream: (opts: { messages: Array<ModelMessage> }) => {
      prompts.push(structuredClone(opts.messages))
      const chunks = iterations[i] ?? []
      i++
      return (async function* () {
        for (const c of chunks) yield c
      })()
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  } as unknown as AnyTextAdapter
  return { adapter, prompts }
}

const t = 1
const run = (
  runId: string,
  chunks: Array<AdapterYieldChunk>,
  finishReason: string,
) =>
  [
    { type: EventType.RUN_STARTED, runId, threadId: 't1', timestamp: t },
    ...chunks,
    {
      type: EventType.RUN_FINISHED,
      runId,
      threadId: 't1',
      finishReason,
      timestamp: t,
    },
  ] as Array<AdapterYieldChunk>

const thinking = (id: string): Array<AdapterYieldChunk> => [
  { type: EventType.REASONING_START, messageId: id, timestamp: t },
  {
    type: EventType.REASONING_MESSAGE_START,
    messageId: id,
    role: 'reasoning',
    timestamp: t,
  },
  {
    type: EventType.REASONING_MESSAGE_CONTENT,
    messageId: id,
    delta: 'plan',
    timestamp: t,
  },
  { type: EventType.REASONING_MESSAGE_END, messageId: id, timestamp: t },
  { type: EventType.REASONING_END, messageId: id, timestamp: t },
]

const text = (messageId: string, delta: string): Array<AdapterYieldChunk> => [
  {
    type: EventType.TEXT_MESSAGE_START,
    messageId,
    role: 'assistant',
    timestamp: t,
  },
  { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta, timestamp: t },
  { type: EventType.TEXT_MESSAGE_END, messageId, timestamp: t },
]

// Turn 1: call 1 = (thinking) + server tool call with no text, call 2 =
// (thinking) + text. Turn 2: a plain answer.
function model(withThinking: boolean) {
  return [
    run(
      'r1',
      [
        ...(withThinking ? thinking('think-1') : []),
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: 'call_1',
          toolCallName: 'lookup',
          parentMessageId: 'm1',
          timestamp: t,
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: 'call_1',
          delta: '{}',
          timestamp: t,
        },
        { type: EventType.TOOL_CALL_END, toolCallId: 'call_1', timestamp: t },
      ],
      'tool_calls',
    ),
    run(
      'r1',
      [...(withThinking ? thinking('think-2') : []), ...text('m2', 'done')],
      'stop',
    ),
    run('r2', text('m3', 'ok'), 'stop'),
  ]
}

const call1Count = (messages: ReadonlyArray<ModelMessage>) =>
  messages.flatMap((m) => m.toolCalls ?? []).filter((c) => c.id === 'call_1')
    .length

/** What `/api/chat` gets: the client's wire messages after the HTTP hop. */
async function serverMessages(ui: Array<UIMessage>, runId: string) {
  const params = await chatParamsFromRequestBody({
    threadId: 't1',
    runId,
    messages: JSON.parse(JSON.stringify(uiMessagesToWire(ui))),
    tools: [],
    context: [],
  })
  return params.messages
}

describe('useChat + withPersistence: message ids across model calls', () => {
  for (const withThinking of [false, true]) {
    it(`sends and stores a server tool call once (thinking first: ${withThinking})`, async () => {
      const persistence = memoryPersistence()
      const { adapter, prompts } = mockAdapter(model(withThinking))
      const tools = [
        {
          name: 'lookup',
          description: 'Lookup',
          execute: () => ({ ok: true }),
        },
      ]
      const middleware = [withPersistence(persistence)]

      // Client side, like ChatClient: one processor, every chunk in order.
      const processor = new StreamProcessor()
      const user1: UIMessage = {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', content: 'hi' }],
      }
      processor.setMessages([user1])
      processor.prepareAssistantMessage()
      for await (const chunk of chat({
        adapter,
        messages: await serverMessages([user1], 'r1'),
        tools,
        runId: 'r1',
        threadId: 't1',
        middleware,
      }) as AsyncIterable<StreamChunk>) {
        processor.processChunk(chunk)
      }
      processor.finalizeStream()

      const user2: UIMessage = {
        id: 'u2',
        role: 'user',
        parts: [{ type: 'text', content: 'next' }],
      }
      for await (const _ of chat({
        adapter,
        messages: await serverMessages(
          [...processor.getMessages(), user2],
          'r2',
        ),
        tools,
        runId: 'r2',
        threadId: 't1',
        middleware,
      }) as AsyncIterable<StreamChunk>) {
        // drain
      }

      expect(call1Count(prompts[2]!)).toBe(1)
      const stored = threadMessages(
        await persistence.stores.messages!.loadThread('t1'),
      )
      expect(call1Count(stored)).toBe(1)
    })
  }
})
