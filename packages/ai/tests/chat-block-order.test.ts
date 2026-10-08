import { describe, expect, it } from 'vitest'
import { chat } from '../src/activities/chat'
import { convertMessagesToModelMessages } from '../src/activities/chat/messages'
import { StreamProcessor } from '../src/activities/chat/stream/processor'
import { tanstackMetadata } from '../src/utilities/merge-metadata'
import { EventType } from '../src/types'
import {
  chunk,
  clientTool,
  collectChunks,
  createMockAdapter,
  ev,
  serverTool,
} from './test-utils'
import type { ChatMiddleware } from '../src/activities/chat/middleware/types'
import type { AdapterYieldChunk } from '../src/utilities/adapter-yield-chunk'
import type { ModelMessage, StreamChunk, Tool } from '../src/types'

/** One signed thinking block, the way Anthropic streams it. */
function reasoning(stepName: string, content: string, signature: string) {
  return [
    ev.stepStarted(stepName),
    chunk(EventType.REASONING_MESSAGE_CONTENT, {
      messageId: `${stepName}-reasoning`,
      delta: content,
    }),
    { ...ev.stepFinished('', stepName), signature },
  ]
}

function callTool(toolCallId: string, name: string) {
  return [
    ev.toolStart(toolCallId, name),
    ev.toolArgs(toolCallId, '{}'),
    ev.toolEnd(toolCallId),
  ]
}

function text(content: string) {
  return [ev.textStart(), ev.textContent(content), ev.textEnd()]
}

/** The history that the adapter gets on its second call. */
async function historyAfter(
  turn: Array<AdapterYieldChunk>,
): Promise<Array<ModelMessage>> {
  const { adapter, calls } = createMockAdapter({
    iterations: [
      turn,
      [ev.runStarted(), ...text('Done.'), ev.runFinished('stop')],
    ],
  })
  await collectChunks(
    chat({
      adapter,
      messages: [{ role: 'user', content: 'Go' }],
      tools: [serverTool('lookup', () => ({ found: true }))],
    }) as AsyncIterable<StreamChunk>,
  )
  expect(calls).toHaveLength(2)
  return calls[1]!.messages
}

/** The messages that chat() holds when the run ends. */
async function messagesAtFinish(
  turn: Array<AdapterYieldChunk>,
  tools: Array<Tool> = [],
): Promise<ReadonlyArray<ModelMessage>> {
  let messages: ReadonlyArray<ModelMessage> = []
  const capture: ChatMiddleware = {
    name: 'capture',
    onFinish: (ctx) => {
      messages = ctx.messages
    },
  }
  const { adapter } = createMockAdapter({ iterations: [turn] })
  await collectChunks(
    chat({
      adapter,
      messages: [{ role: 'user', content: 'Go' }],
      tools,
      middleware: [capture],
    }) as AsyncIterable<StreamChunk>,
  )
  return messages
}

const interleavedCalls = [
  { type: 'thinking', index: 0 },
  { type: 'tool-call', id: 'call_1' },
  { type: 'thinking', index: 1 },
  { type: 'tool-call', id: 'call_2' },
]

describe('chat() block order', () => {
  it('writes the map for a client-tool answer: thinking, tool, thinking, tool', async () => {
    const messages = await messagesAtFinish(
      [
        ev.runStarted(),
        ...reasoning('step-1', 'plan', 'sig-a'),
        ...callTool('call_1', 'pick'),
        ...reasoning('step-2', 'next', 'sig-b'),
        ...callTool('call_2', 'pick'),
        ev.runFinished('tool_calls'),
      ],
      [clientTool('pick')],
    )

    expect(
      messages.filter((message) => message.role === 'assistant'),
    ).toMatchObject([
      {
        content: null,
        thinking: [
          { content: 'plan', signature: 'sig-a' },
          { content: 'next', signature: 'sig-b' },
        ],
        toolCalls: [{ id: 'call_1' }, { id: 'call_2' }],
        blockOrder: interleavedCalls,
      },
    ])
  })

  it('sends the map to the adapter on the next call', async () => {
    const history = await historyAfter([
      ev.runStarted(),
      ...reasoning('step-1', 'plan', 'sig-a'),
      ...callTool('call_1', 'lookup'),
      ...reasoning('step-2', 'next', 'sig-b'),
      ...callTool('call_2', 'lookup'),
      ev.runFinished('tool_calls'),
    ])

    expect(
      history
        .filter((message) => message.role === 'assistant')
        .map((message) => message.blockOrder),
    ).toEqual([interleavedCalls])
  })

  it('writes no map for an answer in the default order', async () => {
    const history = await historyAfter([
      ev.runStarted(),
      ...reasoning('step-1', 'plan', 'sig-a'),
      ...text('Checking.'),
      ...callTool('call_1', 'lookup'),
      ev.runFinished('tool_calls'),
    ])

    const assistant = history.find((message) => message.role === 'assistant')
    expect(assistant?.content).toBe('Checking.')
    expect(assistant).not.toHaveProperty('blockOrder')
  })

  it('keeps the split at thinking after a provider tool and maps inside the segment', async () => {
    const history = await historyAfter([
      ev.runStarted(),
      ...reasoning('step-1', 'plan', 'sig-a'),
      {
        ...ev.toolStart('srvtoolu_1', 'web_search'),
        metadata: { providerExecuted: true },
      },
      ev.toolEnd('srvtoolu_1'),
      ...reasoning('step-2', 'refine', 'sig-b'),
      ...callTool('call_1', 'lookup'),
      ...reasoning('step-3', 'more', 'sig-c'),
      ...callTool('call_2', 'lookup'),
      ev.runFinished('tool_calls'),
    ])

    const assistants = history.filter((message) => message.role === 'assistant')
    expect(
      assistants.map((message) => ({
        toolCalls: message.toolCalls?.map((toolCall) => toolCall.id),
        blockOrder: message.blockOrder,
      })),
    ).toEqual([
      { toolCalls: ['srvtoolu_1'], blockOrder: undefined },
      { toolCalls: ['call_1', 'call_2'], blockOrder: interleavedCalls },
    ])
    expect(assistants[1]?.id).toBe(`${assistants[0]?.id}-segment-1`)
  })

  it('writes the map on a final answer: thinking, text, thinking, text', async () => {
    const messages = await messagesAtFinish([
      ev.runStarted(),
      ...reasoning('step-1', 'plan', 'sig-a'),
      ...text('A'),
      ...reasoning('step-2', 'check', 'sig-b'),
      ...text('B'),
      ev.runFinished('stop'),
    ])

    expect(messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'AB',
      blockOrder: [
        { type: 'thinking', index: 0 },
        { type: 'text', length: 1 },
        { type: 'thinking', index: 1 },
        { type: 'text', length: 1 },
      ],
    })
  })

  it('sends a client-tool answer as ordered rows that fold back into one message', async () => {
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ...reasoning('step-1', 'plan', 'sig-a'),
          ...callTool('call_1', 'pick'),
          ...reasoning('step-2', 'next', 'sig-b'),
          ...callTool('call_2', 'pick'),
          ev.runFinished('tool_calls'),
        ],
      ],
    })
    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Pick two' }],
        tools: [clientTool('pick')],
      }) as AsyncIterable<StreamChunk>,
    )
    const snapshot = chunks.find(
      (candidate) => candidate.type === EventType.MESSAGES_SNAPSHOT,
    )
    if (snapshot?.type !== EventType.MESSAGES_SNAPSHOT) {
      throw new Error('missing MESSAGES_SNAPSHOT')
    }

    // The wire keeps the real order. The second row continues the first.
    const turn = snapshot.messages.filter((message) => message.role !== 'user')
    expect(
      turn.map((message) =>
        message.role === 'assistant'
          ? {
              role: message.role,
              toolCalls: message.toolCalls?.map((toolCall) => toolCall.id),
              continues: tanstackMetadata(message)?.continues,
            }
          : { role: message.role },
      ),
    ).toEqual([
      { role: 'reasoning' },
      { role: 'assistant', toolCalls: ['call_1'], continues: undefined },
      { role: 'reasoning' },
      { role: 'assistant', toolCalls: ['call_2'], continues: turn[1]?.id },
    ])

    // The client shows one message in the real order.
    const processor = new StreamProcessor({})
    processor.processChunk(snapshot)
    expect(
      processor
        .getMessages()
        .filter((message) => message.role === 'assistant')
        .map((message) => message.parts.map((part) => part.type)),
    ).toEqual([['thinking', 'tool-call', 'thinking', 'tool-call']])

    // Our server joins the rows back into the message that chat() stored.
    const body: Array<ModelMessage> = JSON.parse(
      JSON.stringify(snapshot.messages),
    )
    expect(
      convertMessagesToModelMessages(body)
        .filter((message) => message.role === 'assistant')
        .map((message) => message.blockOrder),
    ).toEqual([interleavedCalls])
  })
})
