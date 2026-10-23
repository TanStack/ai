import { describe, expect, it } from 'vitest'
import { EventType, chat, convertMessagesToModelMessages } from '@tanstack/ai'
import { toolDefinition } from '@tanstack/ai/client'
import { readUIMessageStream } from 'ai'
import { z } from 'zod'
import { fromAISDKMessages, toUIMessageStream } from '../src'
import type {
  AdapterYieldChunk,
  AnyTextAdapter,
  ModelMessage,
  StreamChunk,
} from '@tanstack/ai'
import type { UIMessage } from 'ai'

type Step = (
  ids: { runId: string; threadId: string; messageId: string },
  messages: Array<ModelMessage>,
) => Array<AdapterYieldChunk>

/** A text adapter that plays one step per model call and keeps each request. */
function scriptedAdapter(steps: Array<Step>) {
  const requests: Array<Array<ModelMessage>> = []
  const adapter: AnyTextAdapter = {
    kind: 'text',
    name: 'scripted',
    model: 'scripted',
    '~types': {
      providerOptions: {},
      inputModalities: ['text'],
      messageMetadataByModality: {},
      toolCapabilities: [],
      toolCallMetadata: undefined,
      systemPromptMetadata: undefined,
    },
    async *chatStream(options) {
      requests.push(options.messages)
      const step = steps[requests.length - 1]
      if (!step) throw new Error('No more steps')
      const runId = options.runId ?? 'run'
      const threadId = options.threadId ?? 'thread'
      yield { type: EventType.RUN_STARTED, runId, threadId, model: 'scripted' }
      yield* step(
        { runId, threadId, messageId: `${runId}-${requests.length}` },
        options.messages,
      )
    },
    structuredOutput: () => Promise.resolve({ data: {}, rawText: '{}' }),
  }
  return { adapter, requests }
}

// Gemini: a grounded search the provider ran, then a function call that
// carries a thought signature the next request must send back.
const toolStep: Step = ({ runId, threadId, messageId }) => [
  {
    type: EventType.TOOL_CALL_START,
    toolCallId: 'search-1',
    toolCallName: 'google_search',
    parentMessageId: messageId,
    metadata: {
      providerExecuted: true,
      sources: [{ url: 'https://weather.example', title: 'Weather' }],
      gemini: { groundingMetadata: { queries: ['nyc weather'] } },
    },
  },
  { type: EventType.TOOL_CALL_END, toolCallId: 'search-1', input: {} },
  {
    type: EventType.TOOL_CALL_START,
    toolCallId: 'call-1',
    toolCallName: 'weather',
    parentMessageId: messageId,
    metadata: { thoughtSignature: 'sig-gemini' },
  },
  {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 'call-1',
    delta: '{"city":"NYC"}',
  },
  {
    type: EventType.TOOL_CALL_END,
    toolCallId: 'call-1',
    input: { city: 'NYC' },
  },
  {
    type: EventType.RUN_FINISHED,
    runId,
    threadId,
    model: 'scripted',
    finishReason: 'tool_calls',
    usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
  },
]

function textStep(text: string): Step {
  return ({ runId, threadId, messageId }) => [
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: 'assistant',
      model: 'scripted',
    },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: text },
    { type: EventType.TEXT_MESSAGE_END, messageId },
    {
      type: EventType.RUN_FINISHED,
      runId,
      threadId,
      model: 'scripted',
      finishReason: 'stop',
      responseId: `resp-${text}`,
      usage: { promptTokens: 4, completionTokens: 5, totalTokens: 9 },
      metadata: {
        tanstack: {
          responseItems: [{ id: `msg-${text}` }],
          reasoningItem: true,
        },
      },
    },
  ]
}

const weather = toolDefinition({
  name: 'weather',
  description: 'Weather for a city',
  inputSchema: z.object({ city: z.string() }),
}).server(() => ({ temp: 72 }))

const user: UIMessage = {
  id: 'u-1',
  role: 'user',
  parts: [{ type: 'text', text: 'Weather in NYC?' }],
}

async function aiSdkMessage(
  stream: AsyncIterable<StreamChunk>,
): Promise<UIMessage> {
  let last: UIMessage | undefined
  for await (const message of readUIMessageStream({
    stream: toUIMessageStream(stream),
  }))
    last = message
  return last!
}

describe('TanStack server, AI SDK client: fidelity', () => {
  it('keeps tool-call metadata, provider-executed calls, sources, steps and message metadata', async () => {
    const { adapter, requests } = scriptedAdapter([
      toolStep,
      textStep('Sunny.'),
      textStep('Again.'),
    ])
    const first = await aiSdkMessage(
      chat({
        adapter,
        threadId: 'chat-1',
        messages: fromAISDKMessages([user]),
        tools: [weather],
      }),
    )

    expect(first.parts).toMatchObject([
      { type: 'step-start' },
      {
        type: 'tool-google_search',
        state: 'output-available',
        providerExecuted: true,
        output: [{ url: 'https://weather.example', title: 'Weather' }],
        callProviderMetadata: { tanstack: { providerExecuted: true } },
      },
      {
        type: 'source-url',
        sourceId: 'search-1-source-0',
        url: 'https://weather.example',
        title: 'Weather',
      },
      {
        type: 'tool-weather',
        state: 'output-available',
        output: { temp: 72 },
        callProviderMetadata: { tanstack: { thoughtSignature: 'sig-gemini' } },
      },
      { type: 'step-start' },
      { type: 'text', text: 'Sunny.' },
    ])
    expect(first.metadata).toMatchObject({
      tanstack: {
        model: 'scripted',
        responseId: 'resp-Sunny.',
        finishReason: 'stop',
        responseItems: [{ id: 'msg-Sunny.' }],
        reasoningItem: true,
        tokenUsage: [{ totalTokens: 3 }, { totalTokens: 9 }],
      },
    })

    // The AI SDK client posts the history back.
    const history = fromAISDKMessages([
      user,
      first,
      { id: 'u-2', role: 'user', parts: [{ type: 'text', text: 'Again?' }] },
    ])
    const assistant = convertMessagesToModelMessages(history).slice(1, -1)
    expect(assistant).toMatchObject([
      {
        role: 'assistant',
        toolCalls: [
          {
            id: 'search-1',
            metadata: { providerExecuted: true, gemini: {} },
          },
          {
            id: 'call-1',
            function: { name: 'weather', arguments: '{"city":"NYC"}' },
            metadata: { thoughtSignature: 'sig-gemini' },
          },
        ],
      },
      { role: 'tool', toolCallId: 'call-1', content: '{"temp":72}' },
      { role: 'assistant', content: 'Sunny.' },
    ])
    // The response items name one model call, so a two-step message drops them.
    expect(assistant[0]?.metadata?.tanstack).not.toHaveProperty('responseItems')
    expect(assistant[0]?.metadata?.tanstack).toMatchObject({
      reasoningItem: true,
    })

    // chat() replays it: the signature goes to the provider, and the
    // provider-executed call is not a pending call.
    const second = await aiSdkMessage(
      chat({
        adapter,
        threadId: 'chat-1',
        messages: history,
        tools: [weather],
      }),
    )
    expect(second.parts).toMatchObject([
      { type: 'step-start' },
      { type: 'text', text: 'Again.' },
    ])
    const replayed = requests[2]!
    expect(replayed.filter((m) => m.role === 'tool')).toHaveLength(1)
    expect(
      replayed.flatMap((m) => m.toolCalls ?? []).map((c) => c.metadata),
    ).toMatchObject([
      { providerExecuted: true },
      { thoughtSignature: 'sig-gemini' },
    ])
  })

  it('keeps the response items of a one-step message', async () => {
    const { adapter } = scriptedAdapter([textStep('Hi.')])
    const message = await aiSdkMessage(
      chat({ adapter, threadId: 't', messages: fromAISDKMessages([user]) }),
    )
    const [, assistant] = fromAISDKMessages([user, message])
    expect(assistant?.metadata).toMatchObject({
      tanstack: { responseItems: [{ id: 'msg-Hi.' }], responseId: 'resp-Hi.' },
    })
  })

  it('adds a tool-call signature that comes as a REASONING_ENCRYPTED_VALUE', async () => {
    async function* events(): AsyncGenerator<StreamChunk> {
      yield {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'call-1',
        toolCallName: 'weather',
      }
      yield {
        type: EventType.REASONING_ENCRYPTED_VALUE,
        subtype: 'tool-call',
        entityId: 'call-1',
        encryptedValue: 'sig-late',
      }
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: 'call-1',
        delta: '{}',
      }
      yield { type: EventType.TOOL_CALL_END, toolCallId: 'call-1' }
    }
    const message = await aiSdkMessage(events())
    const [assistant] = fromAISDKMessages([message])
    expect(assistant?.parts).toMatchObject([
      {
        type: 'tool-call',
        id: 'call-1',
        metadata: { thoughtSignature: 'sig-late' },
      },
    ])
  })
})
