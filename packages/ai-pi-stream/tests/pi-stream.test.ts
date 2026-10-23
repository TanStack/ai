import { describe, expect, it } from 'vitest'
import { EventSchemas } from '@ag-ui/core/schemas'
import { agentLoop } from '@earendil-works/pi-agent-core'
import {
  Type,
  createFauxCore,
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
} from '@earendil-works/pi-ai'
import { EventType, chat, convertMessagesToModelMessages } from '@tanstack/ai'
import { toolDefinition } from '@tanstack/ai/client'
import { ChatClient } from '@tanstack/ai-client'
import { z } from 'zod'
import {
  fromPiAgentEvents,
  fromPiMessages,
  toPiAgentEvents,
  toPiMessages,
} from '../src'
import type { AgentEvent, AgentTool } from '@earendil-works/pi-agent-core'
import type { Message } from '@earendil-works/pi-ai'
import type {
  AdapterYieldChunk,
  AnyTextAdapter,
  ModelMessage,
  StreamChunk,
} from '@tanstack/ai'

/** A pi agent loop with a faux model that calls `weather`, then answers. */
function piAgent(
  history: Array<Message>,
  weatherResult: { text: string; isError?: boolean } = { text: '{"temp":72}' },
) {
  const faux = createFauxCore({ tokenSize: { min: 100, max: 100 } })
  faux.setResponses([
    fauxAssistantMessage(
      [
        {
          type: 'thinking',
          thinking: 'Check the weather.',
          thinkingSignature: 'sig-1',
        },
        fauxText('Checking.'),
        {
          ...fauxToolCall('weather', { city: 'NYC' }, { id: 'c1' }),
          thoughtSignature: 'sig-call',
        },
      ],
      { stopReason: 'toolUse', responseId: 'resp-1' },
    ),
    fauxAssistantMessage('It is 72F.', { responseId: 'resp-2' }),
  ])
  const weather: AgentTool = {
    name: 'weather',
    label: 'Weather',
    description: 'Weather for a city',
    parameters: Type.Object({ city: Type.String() }),
    execute: () =>
      Promise.resolve({
        content: [{ type: 'text', text: weatherResult.text }],
        details: undefined,
        ...(weatherResult.isError && { isError: true }),
      }),
  }
  const prompt = history.at(-1)
  return agentLoop(
    prompt ? [prompt] : [],
    { messages: history.slice(0, -1), tools: [weather] },
    {
      model: faux.getModel(),
      convertToLlm: (messages) =>
        messages.filter((m): m is Message => 'role' in m),
    },
    undefined,
    (model, context, options) => faux.streamSimple(model, context, options),
  )
}

async function collect<T>(stream: AsyncIterable<T>): Promise<Array<T>> {
  const out: Array<T> = []
  for await (const item of stream) out.push(item)
  return out
}

describe('pi agent, TanStack client', () => {
  it('renders a pi run in useChat and sends the history back as pi messages', async () => {
    const sent: Array<Array<Message>> = []
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: {
        async *connect(messages, _data, _signal, { threadId, runId }) {
          const history = toPiMessages(convertMessagesToModelMessages(messages))
          sent.push(history)
          yield* fromPiAgentEvents(piAgent(history), { threadId, runId })
        },
      },
    })

    await client.sendMessage('Weather in NYC?')

    // Each pi assistant message is one assistant message, as each model call
    // of chat() is.
    const [, first, second] = client.getMessages()
    expect(first).toMatchObject({
      role: 'assistant',
      metadata: { tanstack: { model: 'faux-1', responseId: 'resp-1' } },
      parts: [
        { type: 'thinking', content: 'Check the weather.', signature: 'sig-1' },
        { type: 'text', content: 'Checking.' },
        {
          type: 'tool-call',
          id: 'c1',
          name: 'weather',
          input: { city: 'NYC' },
          output: { temp: 72 },
          metadata: { thoughtSignature: 'sig-call' },
        },
        { type: 'tool-result', toolCallId: 'c1', content: '{"temp":72}' },
      ],
    })
    expect(second).toMatchObject({
      role: 'assistant',
      parts: [{ type: 'text', content: 'It is 72F.' }],
    })

    // The next turn sends pi the whole history, signatures included.
    await client.sendMessage('Thanks')
    const history = sent[1]!
    expect(history.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'toolResult',
      'assistant',
      'user',
    ])
    expect(history[1]).toMatchObject({
      role: 'assistant',
      content: [
        { type: 'thinking', thinkingSignature: 'sig-1' },
        { type: 'text', text: 'Checking.' },
        {
          type: 'toolCall',
          id: 'c1',
          name: 'weather',
          arguments: { city: 'NYC' },
          thoughtSignature: 'sig-call',
        },
      ],
      stopReason: 'toolUse',
    })
    expect(history[2]).toMatchObject({
      role: 'toolResult',
      toolCallId: 'c1',
      toolName: 'weather',
      isError: false,
    })
  })

  it('ends each assistant message with a RUN_FINISHED, with usage', async () => {
    const events = await collect(
      fromPiAgentEvents(
        piAgent([{ role: 'user', content: 'Weather?', timestamp: 1 }]),
        { threadId: 't', runId: 'r' },
      ),
    )
    for (const event of events) EventSchemas.parse(event)
    const finished = events.filter((e) => e.type === EventType.RUN_FINISHED)
    expect(finished).toMatchObject([
      { finishReason: 'tool_calls', responseId: 'resp-1' },
      { finishReason: 'stop', responseId: 'resp-2' },
    ])
    expect(finished[0]).toMatchObject({
      usage: [{ provider: 'faux', model: 'faux-1' }],
    })
  })

  it('marks an error tool result and turns a failed model call into RUN_ERROR', async () => {
    const events = await collect(
      fromPiAgentEvents(
        piAgent([{ role: 'user', content: 'Weather?', timestamp: 1 }], {
          text: 'No such city',
          isError: true,
        }),
        { threadId: 't', runId: 'r' },
      ),
    )
    expect(
      events.find((e) => e.type === EventType.TOOL_CALL_RESULT),
    ).toMatchObject({
      content: 'No such city',
      metadata: { tanstack: { state: 'output-error' } },
    })

    async function* failing(): AsyncGenerator<AgentEvent> {
      yield { type: 'agent_start' }
      const message = fauxAssistantMessage('', {
        stopReason: 'error',
        errorMessage: 'Overloaded',
      })
      yield { type: 'message_start', message }
      yield { type: 'message_end', message }
      yield { type: 'agent_end', messages: [message] }
    }
    const failed = await collect(
      fromPiAgentEvents(failing(), { threadId: 't', runId: 'r' }),
    )
    expect(failed.map((e) => e.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.RUN_ERROR,
    ])
    expect(failed[1]).toMatchObject({ message: 'Overloaded' })
  })
})

type Step = (messageId: string) => Array<AdapterYieldChunk>

/** A text adapter that plays one step per model call. */
function scriptedAdapter(steps: Array<Step>) {
  const requests: Array<Array<ModelMessage>> = []
  const adapter: AnyTextAdapter = {
    kind: 'text',
    name: 'scripted',
    model: 'scripted-1',
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
      yield {
        type: EventType.RUN_STARTED,
        runId,
        threadId,
        model: 'scripted-1',
      }
      yield* step(`${runId}-${requests.length}`)
      yield {
        type: EventType.RUN_FINISHED,
        runId,
        threadId,
        model: 'scripted-1',
        finishReason: requests.length === 1 ? 'tool_calls' : 'stop',
        usage: { promptTokens: 4, completionTokens: 5, totalTokens: 9 },
      }
    },
    structuredOutput: () => Promise.resolve({ data: {}, rawText: '{}' }),
  }
  return { adapter, requests }
}

const toolStep: Step = (messageId) => [
  {
    type: EventType.REASONING_MESSAGE_START,
    messageId: 'think-1',
    role: 'reasoning',
  },
  {
    type: EventType.REASONING_MESSAGE_CONTENT,
    messageId: 'think-1',
    delta: 'Plan.',
  },
  {
    type: EventType.REASONING_ENCRYPTED_VALUE,
    subtype: 'message',
    entityId: 'think-1',
    encryptedValue: 'sig-1',
  },
  { type: EventType.REASONING_MESSAGE_END, messageId: 'think-1' },
  {
    type: EventType.TOOL_CALL_START,
    toolCallId: 'c1',
    toolCallName: 'weather',
    parentMessageId: messageId,
  },
  { type: EventType.TOOL_CALL_ARGS, toolCallId: 'c1', delta: '{"city":"NYC"}' },
  { type: EventType.TOOL_CALL_END, toolCallId: 'c1', input: { city: 'NYC' } },
]

const textStep: Step = (messageId) => [
  { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' },
  { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: 'Sunny.' },
  { type: EventType.TEXT_MESSAGE_END, messageId },
]

const weather = toolDefinition({
  name: 'weather',
  description: 'Weather for a city',
  inputSchema: z.object({ city: z.string() }),
}).server(() => ({ temp: 72 }))

describe('TanStack server, pi client', () => {
  it('turns a chat() run into pi turns, and the pi messages replay into chat()', async () => {
    const { adapter, requests } = scriptedAdapter([toolStep, textStep])
    const events = await collect(
      toPiAgentEvents(
        chat({
          adapter,
          threadId: 't',
          messages: [{ role: 'user', content: 'Weather in NYC?' }],
          tools: [weather],
        }),
      ),
    )

    // The same order as a pi agent loop.
    expect(
      events.map((e) =>
        e.type === 'message_update'
          ? e.assistantMessageEvent.type
          : e.type === 'message_start' || e.type === 'message_end'
            ? `${e.type}:${'role' in e.message ? e.message.role : ''}`
            : e.type,
      ),
    ).toEqual([
      'agent_start',
      'turn_start',
      'message_start:assistant',
      'thinking_start',
      'thinking_delta',
      'thinking_end',
      'toolcall_start',
      'toolcall_delta',
      'toolcall_end',
      'message_end:assistant',
      'tool_execution_start',
      'tool_execution_end',
      'message_start:toolResult',
      'message_end:toolResult',
      'turn_end',
      'turn_start',
      'message_start:assistant',
      'text_start',
      'text_delta',
      'text_end',
      'message_end:assistant',
      'turn_end',
      'agent_end',
    ])

    const end = events.at(-1)
    if (end?.type !== 'agent_end') throw new Error('No agent_end')
    expect(end.messages).toMatchObject([
      {
        role: 'assistant',
        provider: 'scripted',
        model: 'scripted-1',
        stopReason: 'toolUse',
        usage: { input: 4, output: 5, totalTokens: 9 },
        content: [
          { type: 'thinking', thinking: 'Plan.', thinkingSignature: 'sig-1' },
          {
            type: 'toolCall',
            id: 'c1',
            name: 'weather',
            arguments: { city: 'NYC' },
          },
        ],
      },
      {
        role: 'toolResult',
        toolCallId: 'c1',
        toolName: 'weather',
        content: [{ type: 'text', text: '{"temp":72}' }],
        isError: false,
      },
      {
        role: 'assistant',
        stopReason: 'stop',
        content: [{ type: 'text', text: 'Sunny.' }],
      },
    ])

    // The pi client posts its history back, and chat() reads it.
    const { messages, systemPrompts } = fromPiMessages([
      { role: 'system', content: 'Be brief.', timestamp: 1 },
      { role: 'user', content: 'Weather in NYC?', timestamp: 1 },
      ...end.messages,
      { role: 'user', content: 'Thanks', timestamp: 2 },
    ])
    expect(systemPrompts).toEqual(['Be brief.'])
    const { adapter: next, requests: nextRequests } = scriptedAdapter([
      textStep,
    ])
    await collect(
      chat({ adapter: next, threadId: 't', messages, tools: [weather] }),
    )
    expect(nextRequests[0]).toMatchObject([
      { role: 'user', content: 'Weather in NYC?' },
      {
        role: 'assistant',
        thinking: [{ content: 'Plan.', signature: 'sig-1' }],
        toolCalls: [
          {
            id: 'c1',
            function: { name: 'weather', arguments: '{"city":"NYC"}' },
          },
        ],
      },
      { role: 'tool', toolCallId: 'c1', content: '{"temp":72}' },
      { role: 'assistant', content: 'Sunny.' },
      { role: 'user', content: 'Thanks' },
    ])
    expect(requests).toHaveLength(2)
  })

  it('ends the pi run with an error message on RUN_ERROR', async () => {
    async function* failing(): AsyncGenerator<StreamChunk> {
      yield { type: EventType.RUN_STARTED, threadId: 't', runId: 'r' }
      yield { type: EventType.RUN_ERROR, message: 'Overloaded' }
    }
    const events = await collect(toPiAgentEvents(failing()))
    const end = events.at(-1)
    if (end?.type !== 'agent_end') throw new Error('No agent_end')
    expect(end.messages).toMatchObject([
      { role: 'assistant', stopReason: 'error', errorMessage: 'Overloaded' },
    ])
  })
})

describe('message history', () => {
  it('round-trips TanStack messages through pi messages', () => {
    const messages: Array<ModelMessage> = [
      {
        role: 'user',
        content: [
          { type: 'text', content: 'What is this?' },
          {
            type: 'image',
            source: { type: 'data', value: 'aGk=', mimeType: 'image/png' },
          },
        ],
      },
      {
        role: 'assistant',
        content: 'Looking.',
        thinking: [{ content: 'Hmm.', signature: 'sig' }],
        toolCalls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'lookup', arguments: '{"q":"cat"}' },
          },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'c1',
        content: 'Not found',
        error: 'Not found',
      },
    ]
    const pi = toPiMessages(messages, { systemPrompts: ['Be brief.'] })
    expect(pi[0]).toMatchObject({ role: 'system', content: 'Be brief.' })
    expect(pi[3]).toMatchObject({
      role: 'toolResult',
      toolName: 'lookup',
      isError: true,
    })
    expect(fromPiMessages(pi)).toMatchObject({
      systemPrompts: ['Be brief.'],
      messages,
    })
  })
})
