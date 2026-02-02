import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { createOpenRouterText } from '../src/adapters/text'
import type { OpenRouterTextModelOptions } from '../src/adapters/text'
import type { StreamChunk, Tool } from '@tanstack/ai'
// Declare mockSend at module level
let mockSend: any

// Mock the SDK with a class defined inline
// eslint-disable-next-line @typescript-eslint/require-await
vi.mock('@openrouter/sdk', async () => {
  return {
    OpenRouter: class {
      chat = {
        send: (...args: Array<unknown>) => mockSend(...args),
      }
    },
  }
})

const createAdapter = () =>
  createOpenRouterText('openai/gpt-4o-mini', 'test-key')

const toolArguments = JSON.stringify({ location: 'Berlin' })

const weatherTool: Tool = {
  name: 'lookup_weather',
  description: 'Return the forecast for a location',
}

// Helper to create async iterable from chunks
function createAsyncIterable<T>(chunks: Array<T>): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0
      return {
        // eslint-disable-next-line @typescript-eslint/require-await
        async next() {
          if (index < chunks.length) {
            return { value: chunks[index++]!, done: false }
          }
          return { value: undefined as T, done: true }
        },
      }
    },
  }
}

// Helper to setup the mock SDK client for streaming responses
function setupMockSdkClient(
  streamChunks: Array<Record<string, unknown>>,
  nonStreamResponse?: Record<string, unknown>,
) {
  mockSend = vi.fn().mockImplementation((params) => {
    if (params.stream) {
      return Promise.resolve(createAsyncIterable(streamChunks))
    }
    return Promise.resolve(nonStreamResponse)
  })
}

describe('OpenRouter adapter option mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps options into the Chat Completions API payload', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: { content: 'It is sunny' },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: {},
            finishReason: 'stop',
          },
        ],
        usage: {
          promptTokens: 12,
          completionTokens: 4,
          totalTokens: 16,
        },
      },
    ]

    setupMockSdkClient(streamChunks)

    const adapter = createAdapter()

    const modelOptions: OpenRouterTextModelOptions = {
      tool_choice: 'auto',
    }

    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter,
      systemPrompts: ['Stay concise'],
      messages: [
        { role: 'user', content: 'How is the weather?' },
        {
          role: 'assistant',
          content: 'Let me check',
          toolCalls: [
            {
              id: 'call_weather',
              type: 'function',
              function: { name: 'lookup_weather', arguments: toolArguments },
            },
          ],
        },
        { role: 'tool', toolCallId: 'call_weather', content: '{"temp":72}' },
      ],
      tools: [weatherTool],
      temperature: 0.25,
      topP: 0.6,
      maxTokens: 1024,
      modelOptions,
    })) {
      chunks.push(chunk)
    }

    expect(mockSend).toHaveBeenCalledTimes(1)

    const [params] = mockSend.mock.calls[0]!

    expect(params.model).toBe('openai/gpt-4o-mini')
    expect(params.temperature).toBe(0.25)
    expect(params.topP).toBe(0.6)
    expect(params.maxTokens).toBe(1024)
    expect(params.stream).toBe(true)
    expect(params.tool_choice).toBe('auto')

    expect(params.messages).toBeDefined()
    expect(Array.isArray(params.messages)).toBe(true)

    expect(params.tools).toBeDefined()
    expect(Array.isArray(params.tools)).toBe(true)
    expect(params.tools.length).toBeGreaterThan(0)
  })

  it('streams chat chunks with content and usage', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-stream',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: { content: 'Hello ' },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-stream',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: { content: 'world' },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-stream',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: {},
            finishReason: 'stop',
          },
        ],
        usage: {
          promptTokens: 5,
          completionTokens: 2,
          totalTokens: 7,
        },
      },
    ]

    setupMockSdkClient(streamChunks)

    const adapter = createAdapter()
    const chunks: Array<StreamChunk> = []

    for await (const chunk of chat({
      adapter,
      messages: [{ role: 'user', content: 'Say hello' }],
    })) {
      chunks.push(chunk)
    }

    // AG-UI events: RUN_STARTED, TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT, ...
    const contentChunks = chunks.filter(
      (c) => c.type === 'TEXT_MESSAGE_CONTENT',
    )
    expect(contentChunks.length).toBe(2)

    expect(contentChunks[0]).toMatchObject({
      type: 'TEXT_MESSAGE_CONTENT',
      delta: 'Hello ',
      content: 'Hello ',
    })

    expect(contentChunks[1]).toMatchObject({
      type: 'TEXT_MESSAGE_CONTENT',
      delta: 'world',
      content: 'Hello world',
    })

    const runFinishedChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
    expect(runFinishedChunk).toMatchObject({
      type: 'RUN_FINISHED',
      finishReason: 'stop',
      usage: {
        promptTokens: 5,
        completionTokens: 2,
        totalTokens: 7,
      },
    })
  })

  it('handles tool calls in streaming response', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-456',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: {
              toolCalls: [
                {
                  index: 0,
                  id: 'call_abc123',
                  type: 'function',
                  function: {
                    name: 'lookup_weather',
                    arguments: '{"location":',
                  },
                },
              ],
            },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-456',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: {
              toolCalls: [
                {
                  index: 0,
                  function: {
                    arguments: '"Berlin"}',
                  },
                },
              ],
            },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-456',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: {},
            finishReason: 'tool_calls',
          },
        ],
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      },
    ]

    setupMockSdkClient(streamChunks)

    const adapter = createAdapter()

    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter.chatStream({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'What is the weather in Berlin?' }],
      tools: [weatherTool],
    })) {
      chunks.push(chunk)
    }

    // Check for AG-UI TOOL_CALL_END event
    const toolCallEndChunks = chunks.filter((c) => c.type === 'TOOL_CALL_END')
    expect(toolCallEndChunks.length).toBe(1)

    const toolCallEndChunk = toolCallEndChunks[0]
    if (toolCallEndChunk?.type === 'TOOL_CALL_END') {
      expect(toolCallEndChunk.toolName).toBe('lookup_weather')
      expect(toolCallEndChunk.input).toEqual({ location: 'Berlin' })
    }
  })

  it('handles multimodal input with text and image', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-multimodal',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: { content: 'I can see the image' },
            finishReason: 'stop',
          },
        ],
        usage: { promptTokens: 50, completionTokens: 5, totalTokens: 55 },
      },
    ]

    setupMockSdkClient(streamChunks)

    const adapter = createAdapter()

    for await (const _ of chat({
      adapter,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', content: 'What do you see?' },
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/image.jpg' },
            },
          ],
        },
      ],
    })) {
    }

    const [params] = mockSend.mock.calls[0]!

    const contentParts = params.messages[0].content
    expect(contentParts[0]).toMatchObject({
      type: 'text',
      text: 'What do you see?',
    })
    expect(contentParts[1]).toMatchObject({
      type: 'image_url',
      imageUrl: { url: 'https://example.com/image.jpg' },
    })
  })

  it('yields error chunk on SDK error', async () => {
    mockSend = vi.fn().mockRejectedValueOnce(new Error('Invalid API key'))

    const adapter = createAdapter()

    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter.chatStream({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    expect(chunks.length).toBeGreaterThanOrEqual(1)
    // Should emit AG-UI RUN_ERROR
    const errorChunk = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(errorChunk).toBeDefined()

    if (errorChunk && errorChunk.type === 'RUN_ERROR') {
      expect(errorChunk.error.message).toBe('Invalid API key')
    }
  })
})

describe('OpenRouter AG-UI event emission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('emits RUN_STARTED as the first event', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: { content: 'Hello' },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: {},
            finishReason: 'stop',
          },
        ],
        usage: {
          promptTokens: 5,
          completionTokens: 1,
          totalTokens: 6,
        },
      },
    ]

    setupMockSdkClient(streamChunks)
    const adapter = createAdapter()
    const chunks: Array<StreamChunk> = []

    for await (const chunk of adapter.chatStream({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    expect(chunks[0]?.type).toBe('RUN_STARTED')
    if (chunks[0]?.type === 'RUN_STARTED') {
      expect(chunks[0].runId).toBeDefined()
      expect(chunks[0].model).toBe('openai/gpt-4o-mini')
    }
  })

  it('emits TEXT_MESSAGE_START before TEXT_MESSAGE_CONTENT', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: { content: 'Hello' },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: {},
            finishReason: 'stop',
          },
        ],
        usage: {
          promptTokens: 5,
          completionTokens: 1,
          totalTokens: 6,
        },
      },
    ]

    setupMockSdkClient(streamChunks)
    const adapter = createAdapter()
    const chunks: Array<StreamChunk> = []

    for await (const chunk of adapter.chatStream({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const textStartIndex = chunks.findIndex(
      (c) => c.type === 'TEXT_MESSAGE_START',
    )
    const textContentIndex = chunks.findIndex(
      (c) => c.type === 'TEXT_MESSAGE_CONTENT',
    )

    expect(textStartIndex).toBeGreaterThan(-1)
    expect(textContentIndex).toBeGreaterThan(-1)
    expect(textStartIndex).toBeLessThan(textContentIndex)

    const textStart = chunks[textStartIndex]
    if (textStart?.type === 'TEXT_MESSAGE_START') {
      expect(textStart.messageId).toBeDefined()
      expect(textStart.role).toBe('assistant')
    }
  })

  it('emits TEXT_MESSAGE_END and RUN_FINISHED at the end', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: { content: 'Hello' },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: {},
            finishReason: 'stop',
          },
        ],
        usage: {
          promptTokens: 5,
          completionTokens: 1,
          totalTokens: 6,
        },
      },
    ]

    setupMockSdkClient(streamChunks)
    const adapter = createAdapter()
    const chunks: Array<StreamChunk> = []

    for await (const chunk of adapter.chatStream({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const textEndChunk = chunks.find((c) => c.type === 'TEXT_MESSAGE_END')
    expect(textEndChunk).toBeDefined()
    if (textEndChunk?.type === 'TEXT_MESSAGE_END') {
      expect(textEndChunk.messageId).toBeDefined()
    }

    const runFinishedChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
    expect(runFinishedChunk).toBeDefined()
    if (runFinishedChunk?.type === 'RUN_FINISHED') {
      expect(runFinishedChunk.runId).toBeDefined()
      expect(runFinishedChunk.finishReason).toBe('stop')
      expect(runFinishedChunk.usage).toMatchObject({
        promptTokens: 5,
        completionTokens: 1,
        totalTokens: 6,
      })
    }
  })

  it('emits AG-UI tool call events', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-456',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: {
              toolCalls: [
                {
                  index: 0,
                  id: 'call_abc123',
                  type: 'function',
                  function: {
                    name: 'lookup_weather',
                    arguments: '{"location":',
                  },
                },
              ],
            },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-456',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: {
              toolCalls: [
                {
                  index: 0,
                  function: {
                    arguments: '"Berlin"}',
                  },
                },
              ],
            },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-456',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: {},
            finishReason: 'tool_calls',
          },
        ],
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      },
    ]

    setupMockSdkClient(streamChunks)
    const adapter = createAdapter()
    const chunks: Array<StreamChunk> = []

    for await (const chunk of adapter.chatStream({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'Weather in Berlin?' }],
      tools: [weatherTool],
    })) {
      chunks.push(chunk)
    }

    // Check AG-UI tool events
    const toolStartChunk = chunks.find((c) => c.type === 'TOOL_CALL_START')
    expect(toolStartChunk).toBeDefined()
    if (toolStartChunk?.type === 'TOOL_CALL_START') {
      expect(toolStartChunk.toolCallId).toBe('call_abc123')
      expect(toolStartChunk.toolName).toBe('lookup_weather')
    }

    const toolArgsChunks = chunks.filter((c) => c.type === 'TOOL_CALL_ARGS')
    expect(toolArgsChunks.length).toBeGreaterThan(0)

    const toolEndChunk = chunks.find((c) => c.type === 'TOOL_CALL_END')
    expect(toolEndChunk).toBeDefined()
    if (toolEndChunk?.type === 'TOOL_CALL_END') {
      expect(toolEndChunk.toolCallId).toBe('call_abc123')
      expect(toolEndChunk.toolName).toBe('lookup_weather')
      expect(toolEndChunk.input).toEqual({ location: 'Berlin' })
    }

    // Check finish reason
    const runFinishedChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
    if (runFinishedChunk?.type === 'RUN_FINISHED') {
      expect(runFinishedChunk.finishReason).toBe('tool_calls')
    }
  })

  it('emits RUN_ERROR on SDK error', async () => {
    mockSend = vi.fn().mockRejectedValueOnce(new Error('API key invalid'))

    const adapter = createAdapter()
    const chunks: Array<StreamChunk> = []

    for await (const chunk of adapter.chatStream({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    // Should emit RUN_STARTED even on error
    const runStartedChunk = chunks.find((c) => c.type === 'RUN_STARTED')
    expect(runStartedChunk).toBeDefined()

    // Should emit RUN_ERROR
    const runErrorChunk = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(runErrorChunk).toBeDefined()
    if (runErrorChunk?.type === 'RUN_ERROR') {
      expect(runErrorChunk.error.message).toBe('API key invalid')
    }
  })

  it('emits proper AG-UI event sequence', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: { content: 'Hello world' },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: {},
            finishReason: 'stop',
          },
        ],
        usage: {
          promptTokens: 5,
          completionTokens: 2,
          totalTokens: 7,
        },
      },
    ]

    setupMockSdkClient(streamChunks)
    const adapter = createAdapter()
    const chunks: Array<StreamChunk> = []

    for await (const chunk of adapter.chatStream({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    // Verify proper AG-UI event sequence
    const eventTypes = chunks.map((c) => c.type)

    // Should start with RUN_STARTED
    expect(eventTypes[0]).toBe('RUN_STARTED')

    // Should have TEXT_MESSAGE_START before TEXT_MESSAGE_CONTENT
    const textStartIndex = eventTypes.indexOf('TEXT_MESSAGE_START')
    const textContentIndex = eventTypes.indexOf('TEXT_MESSAGE_CONTENT')
    expect(textStartIndex).toBeGreaterThan(-1)
    expect(textContentIndex).toBeGreaterThan(textStartIndex)

    // Should have TEXT_MESSAGE_END before RUN_FINISHED
    const textEndIndex = eventTypes.indexOf('TEXT_MESSAGE_END')
    const runFinishedIndex = eventTypes.indexOf('RUN_FINISHED')
    expect(textEndIndex).toBeGreaterThan(-1)
    expect(runFinishedIndex).toBeGreaterThan(textEndIndex)

    // Verify RUN_FINISHED has proper data
    const runFinishedChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
    if (runFinishedChunk?.type === 'RUN_FINISHED') {
      expect(runFinishedChunk.finishReason).toBe('stop')
      expect(runFinishedChunk.usage).toBeDefined()
    }
  })

  it('emits STEP_STARTED and STEP_FINISHED for reasoning content', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-123',
        model: 'openai/o1-preview',
        choices: [
          {
            delta: {
              reasoningDetails: [
                {
                  type: 'reasoning.text',
                  text: 'Let me think about this...',
                },
              ],
            },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        model: 'openai/o1-preview',
        choices: [
          {
            delta: { content: 'The answer is 42.' },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        model: 'openai/o1-preview',
        choices: [
          {
            delta: {},
            finishReason: 'stop',
          },
        ],
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
      },
    ]

    setupMockSdkClient(streamChunks)
    const adapter = createAdapter()
    const chunks: Array<StreamChunk> = []

    for await (const chunk of adapter.chatStream({
      model: 'openai/o1-preview',
      messages: [{ role: 'user', content: 'What is the meaning of life?' }],
    })) {
      chunks.push(chunk)
    }

    // Check for STEP_STARTED event
    const stepStartedChunk = chunks.find((c) => c.type === 'STEP_STARTED')
    expect(stepStartedChunk).toBeDefined()
    if (stepStartedChunk?.type === 'STEP_STARTED') {
      expect(stepStartedChunk.stepId).toBeDefined()
      expect(stepStartedChunk.stepType).toBe('thinking')
    }

    // Check for STEP_FINISHED event
    const stepFinishedChunks = chunks.filter((c) => c.type === 'STEP_FINISHED')
    expect(stepFinishedChunks.length).toBeGreaterThan(0)
    const stepFinishedChunk = stepFinishedChunks[0]
    if (stepFinishedChunk?.type === 'STEP_FINISHED') {
      expect(stepFinishedChunk.stepId).toBeDefined()
      expect(stepFinishedChunk.delta).toBe('Let me think about this...')
    }
  })
})
