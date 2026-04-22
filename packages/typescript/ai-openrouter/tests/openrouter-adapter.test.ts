import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { ChatRequest$outboundSchema } from '@openrouter/sdk/models'
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
    if (params.chatRequest?.stream) {
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
      toolChoice: 'auto',
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

    const [rawParams] = mockSend.mock.calls[0]!
    const params = rawParams.chatRequest

    expect(params.model).toBe('openai/gpt-4o-mini')
    expect(params.temperature).toBe(0.25)
    expect(params.topP).toBe(0.6)
    expect(params.maxCompletionTokens).toBe(1024)
    expect(params.stream).toBe(true)
    expect(params.toolChoice).toBe('auto')

    expect(params.messages).toBeDefined()
    expect(Array.isArray(params.messages)).toBe(true)

    expect(params.tools).toBeDefined()
    expect(Array.isArray(params.tools)).toBe(true)
    expect(params.tools.length).toBeGreaterThan(0)

    // Check how the paramaters are serialized through to the openrouter endpoint
    // Openrouter runs the params through an outbound Zod schema that expects camelCase
    const serialized = ChatRequest$outboundSchema.parse(params)

    // keys and remaps them to snake_case for the wire format.
    expect(serialized).toHaveProperty('model', 'openai/gpt-4o-mini')
    expect(serialized).toHaveProperty('temperature', 0.25)
    expect(serialized).toHaveProperty('top_p', 0.6)
    expect(serialized).toHaveProperty('max_completion_tokens', 1024)
    expect(serialized).toHaveProperty('stream', true)
    expect(serialized).toHaveProperty('tool_choice', 'auto')
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
    })

    expect(contentChunks[1]).toMatchObject({
      type: 'TEXT_MESSAGE_CONTENT',
      delta: 'world',
    })

    const runFinishedChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
    expect(runFinishedChunk).toMatchObject({
      type: 'RUN_FINISHED',
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

    const [rawParams] = mockSend.mock.calls[0]!
    const params = rawParams.chatRequest

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
      expect(errorChunk.error?.message).toBe('Invalid API key')
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
      expect(runErrorChunk.error?.message).toBe('API key invalid')
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
    const textStartIndex = eventTypes.indexOf('TEXT_MESSAGE_START' as any)
    const textContentIndex = eventTypes.indexOf('TEXT_MESSAGE_CONTENT' as any)
    expect(textStartIndex).toBeGreaterThan(-1)
    expect(textContentIndex).toBeGreaterThan(textStartIndex)

    // Should have TEXT_MESSAGE_END before RUN_FINISHED
    const textEndIndex = eventTypes.indexOf('TEXT_MESSAGE_END' as any)
    const runFinishedIndex = eventTypes.indexOf('RUN_FINISHED' as any)
    expect(textEndIndex).toBeGreaterThan(-1)
    expect(runFinishedIndex).toBeGreaterThan(textEndIndex)

    // Verify RUN_FINISHED has proper data
    const runFinishedChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
    if (runFinishedChunk?.type === 'RUN_FINISHED') {
      expect(runFinishedChunk.finishReason).toBe('stop')
      expect(runFinishedChunk.usage).toBeDefined()
    }
  })

  it('emits RUN_ERROR on inline error chunk', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-err',
        model: 'openai/gpt-4o-mini',
        choices: [] as Array<unknown>,
        error: { message: 'Rate limit exceeded', code: 429 },
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

    const runErrorChunk = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(runErrorChunk).toBeDefined()
    if (runErrorChunk?.type === 'RUN_ERROR') {
      expect(runErrorChunk.error?.message).toBe('Rate limit exceeded')
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

    // Check for STEP_FINISHED event — emitted once when reasoning closes
    const stepFinishedChunks = chunks.filter((c) => c.type === 'STEP_FINISHED')
    expect(stepFinishedChunks).toHaveLength(1)
    const stepFinishedChunk = stepFinishedChunks[0]
    if (stepFinishedChunk?.type === 'STEP_FINISHED') {
      expect(stepFinishedChunk.stepId).toBeDefined()
      expect(stepFinishedChunk.content).toBe('Let me think about this...')
    }
  })
})

describe('OpenRouter structured output', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends responseFormat with json_schema instead of tools', async () => {
    const nonStreamResponse = {
      choices: [
        {
          message: {
            content: '{"name":"Alice","age":30}',
          },
        },
      ],
    }

    setupMockSdkClient([], nonStreamResponse)
    const adapter = createAdapter()

    const outputSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name', 'age'],
    }

    const result = await adapter.structuredOutput({
      chatOptions: {
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'Give me a person' }],
      },
      outputSchema,
    })

    expect(result.data).toEqual({ name: 'Alice', age: 30 })
    expect(result.rawText).toBe('{"name":"Alice","age":30}')

    // Verify SDK was called with responseFormat, not tools. The schema is
    // transformed to be OpenAI-strict compatible before being sent:
    // additionalProperties defaults to false even if the caller didn't set it.
    const [rawParams] = mockSend.mock.calls[0]!
    const params = rawParams.chatRequest
    expect(params.responseFormat).toEqual({
      type: 'json_schema',
      jsonSchema: {
        name: 'structured_output',
        schema: {
          ...outputSchema,
          additionalProperties: false,
        },
        strict: true,
      },
    })
    expect(params.tools).toBeUndefined()
    expect(params.toolChoice).toBeUndefined()
    expect(params.stream).toBe(false)
  })

  it('makes schema OpenAI-strict compatible before sending', async () => {
    // Regression: upstream providers (OpenAI) reject json_schema requests with
    // strict: true unless every object sets additionalProperties: false and
    // lists every property in required. Prior to the fix, the adapter forwarded
    // the schema unchanged and OpenRouter returned "Provider returned error".
    const nonStreamResponse = {
      choices: [
        {
          message: { content: '{"title":"x","tags":["a"]}' },
        },
      ],
    }
    setupMockSdkClient([], nonStreamResponse)
    const adapter = createAdapter()

    const outputSchema = {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        tags: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              weight: { type: 'number' },
            },
            required: ['name'],
          },
        },
      },
      required: ['title'],
    }

    await adapter.structuredOutput({
      chatOptions: {
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'Generate' }],
      },
      outputSchema,
    })

    const [rawParams] = mockSend.mock.calls[0]!
    const sentSchema = rawParams.chatRequest.responseFormat.jsonSchema.schema

    // Root object: all props required, additionalProperties: false
    expect(sentSchema.additionalProperties).toBe(false)
    expect(sentSchema.required).toEqual(['title', 'description', 'tags'])
    // Optional primitive is made nullable
    expect(sentSchema.properties.description.type).toEqual(['string', 'null'])
    // Optional array must also be made nullable (strict mode requires every
    // required property to be nullable if it was originally optional)
    expect(sentSchema.properties.tags.type).toEqual(['array', 'null'])
    // Nested array items: same transformation applied recursively
    expect(sentSchema.properties.tags.items.additionalProperties).toBe(false)
    expect(sentSchema.properties.tags.items.required).toEqual([
      'name',
      'weight',
    ])
    expect(sentSchema.properties.tags.items.properties.weight.type).toEqual([
      'number',
      'null',
    ])
  })

  it('makes optional nested objects nullable under strict mode', async () => {
    const nonStreamResponse = {
      choices: [{ message: { content: '{"id":"x","meta":null}' } }],
    }
    setupMockSdkClient([], nonStreamResponse)
    const adapter = createAdapter()

    const outputSchema = {
      type: 'object',
      properties: {
        id: { type: 'string' },
        meta: {
          type: 'object',
          properties: {
            createdAt: { type: 'string' },
          },
          required: ['createdAt'],
        },
      },
      required: ['id'],
    }

    await adapter.structuredOutput({
      chatOptions: {
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'Generate' }],
      },
      outputSchema,
    })

    const [rawParams] = mockSend.mock.calls[0]!
    const sentSchema = rawParams.chatRequest.responseFormat.jsonSchema.schema

    expect(sentSchema.required).toEqual(['id', 'meta'])
    expect(sentSchema.properties.meta.type).toEqual(['object', 'null'])
    // Inner object still strict-compatible
    expect(sentSchema.properties.meta.additionalProperties).toBe(false)
    expect(sentSchema.properties.meta.required).toEqual(['createdAt'])
  })

  it('flows through core chat() entrypoint with strict transformation', async () => {
    // End-to-end via chat(): schema converted by the core, then made
    // strict-compatible by the adapter before the SDK call.
    const outputSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
        nickname: { type: 'string' },
      },
      // nickname is intentionally optional — it should be made nullable and
      // added to required[] by the adapter's strict transformation.
      required: ['name', 'age'],
    }

    const nonStreamResponse = {
      choices: [
        { message: { content: '{"name":"Alice","age":30,"nickname":null}' } },
      ],
    }

    setupMockSdkClient(
      [
        // The agentic loop runs one streaming pass before the structured
        // output call — provide a trivial stream that terminates immediately.
        {
          id: 'c1',
          model: 'openai/gpt-4o-mini',
          choices: [{ delta: { content: 'ok' }, finishReason: 'stop' }],
        },
      ],
      nonStreamResponse,
    )
    const adapter = createAdapter()

    const result = await chat({
      adapter,
      messages: [{ role: 'user', content: 'Give me a person' }],
      outputSchema,
    })

    expect(result).toEqual({ name: 'Alice', age: 30, nickname: null })

    // Find the non-streaming call (the structured output request).
    const structuredCall = mockSend.mock.calls.find(
      ([args]: Array<any>) => args.chatRequest.stream === false,
    )
    expect(structuredCall).toBeDefined()
    const sentSchema =
      structuredCall[0].chatRequest.responseFormat.jsonSchema.schema

    expect(sentSchema.additionalProperties).toBe(false)
    expect(sentSchema.required).toEqual(['name', 'age', 'nickname'])
    expect(sentSchema.properties.nickname.type).toEqual(['string', 'null'])
  })

  it('parses JSON response content correctly', async () => {
    const nonStreamResponse = {
      choices: [
        {
          message: {
            content: '{"items":[1,2,3],"total":3}',
          },
        },
      ],
    }

    setupMockSdkClient([], nonStreamResponse)
    const adapter = createAdapter()

    const result = await adapter.structuredOutput({
      chatOptions: {
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'List items' }],
      },
      outputSchema: { type: 'object' },
    })

    expect(result.data).toEqual({ items: [1, 2, 3], total: 3 })
  })

  it('throws on malformed JSON response', async () => {
    const nonStreamResponse = {
      choices: [
        {
          message: {
            content: 'not valid json{',
          },
        },
      ],
    }

    setupMockSdkClient([], nonStreamResponse)
    const adapter = createAdapter()

    await expect(
      adapter.structuredOutput({
        chatOptions: {
          model: 'openai/gpt-4o-mini',
          messages: [{ role: 'user', content: 'Give me data' }],
        },
        outputSchema: { type: 'object' },
      }),
    ).rejects.toThrow('Failed to parse structured output as JSON')
  })

  it('throws on SDK error', async () => {
    mockSend = vi.fn().mockRejectedValueOnce(new Error('Server error'))

    const adapter = createAdapter()

    await expect(
      adapter.structuredOutput({
        chatOptions: {
          model: 'openai/gpt-4o-mini',
          messages: [{ role: 'user', content: 'Give me data' }],
        },
        outputSchema: { type: 'object' },
      }),
    ).rejects.toThrow('Structured output generation failed: Server error')
  })

  it('handles empty content gracefully', async () => {
    const nonStreamResponse = {
      choices: [
        {
          message: {
            content: '',
          },
        },
      ],
    }

    setupMockSdkClient([], nonStreamResponse)
    const adapter = createAdapter()

    await expect(
      adapter.structuredOutput({
        chatOptions: {
          model: 'openai/gpt-4o-mini',
          messages: [{ role: 'user', content: 'Give me data' }],
        },
        outputSchema: { type: 'object' },
      }),
    ).rejects.toThrow('Structured output response contained no content')
  })
})

describe('OpenRouter modelOptions pass-through', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const minimalStreamChunks = [
    {
      id: 'chatcmpl-opts',
      model: 'openai/gpt-4o-mini',
      choices: [
        {
          delta: { content: 'ok' },
          finishReason: 'stop',
        },
      ],
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    },
  ]

  it('forwards camelCase sampling options to the SDK request', async () => {
    setupMockSdkClient(minimalStreamChunks)
    const adapter = createAdapter()

    const modelOptions: OpenRouterTextModelOptions = {
      frequencyPenalty: 0.5,
      presencePenalty: 0.3,
      maxCompletionTokens: 2048,
      topLogprobs: 5,
      logitBias: { 123: -50 },
      logprobs: true,
      seed: 42,
      stop: ['END'],
      responseFormat: { type: 'json_object' },
    }

    for await (const _ of chat({
      adapter,
      messages: [{ role: 'user', content: 'test' }],
      modelOptions,
    })) {
      // consume
    }

    const [rawParams] = mockSend.mock.calls[0]!
    const params = rawParams.chatRequest
    expect(params.frequencyPenalty).toBe(0.5)
    expect(params.presencePenalty).toBe(0.3)
    expect(params.maxCompletionTokens).toBe(2048)
    expect(params.topLogprobs).toBe(5)
    expect(params.logitBias).toEqual({ 123: -50 })
    expect(params.logprobs).toBe(true)
    expect(params.seed).toBe(42)
    expect(params.stop).toEqual(['END'])
    expect(params.responseFormat).toEqual({ type: 'json_object' })
  })

  it('forwards common options (provider, plugins, etc.) to the SDK request', async () => {
    setupMockSdkClient(minimalStreamChunks)
    const adapter = createAdapter()

    const modelOptions: OpenRouterTextModelOptions = {
      provider: { order: ['openai'], allowFallbacks: false },
      plugins: [{ id: 'web', maxResults: 5 }],
      user: 'test-user-123',
      metadata: { env: 'test' },
      debug: { echoUpstreamBody: true },
      sessionId: 'session-abc',
    }

    for await (const _ of chat({
      adapter,
      messages: [{ role: 'user', content: 'test' }],
      modelOptions,
    })) {
      // consume
    }

    const [rawParams] = mockSend.mock.calls[0]!
    const params = rawParams.chatRequest
    expect(params.provider).toEqual({
      order: ['openai'],
      allowFallbacks: false,
    })
    expect(params.plugins).toEqual([{ id: 'web', maxResults: 5 }])
    expect(params.user).toBe('test-user-123')
    expect(params.metadata).toEqual({ env: 'test' })
    expect(params.debug).toEqual({ echoUpstreamBody: true })
    expect(params.sessionId).toBe('session-abc')
  })

  it('does not allow modelOptions to override top-level temperature/topP/maxTokens', async () => {
    setupMockSdkClient(minimalStreamChunks)
    const adapter = createAdapter()

    for await (const _ of chat({
      adapter,
      messages: [{ role: 'user', content: 'test' }],
      temperature: 0.5,
      topP: 0.8,
      maxTokens: 500,
      modelOptions: {
        temperature: 0.9,
        topP: 0.1,
        maxCompletionTokens: 9999,
      } as OpenRouterTextModelOptions,
    })) {
      // consume
    }

    const [rawParams] = mockSend.mock.calls[0]!
    const params = rawParams.chatRequest
    // Top-level values should win because modelOptions has those keys Omitted
    expect(params.temperature).toBe(0.5)
    expect(params.topP).toBe(0.8)
    expect(params.maxCompletionTokens).toBe(500)
  })

  it('appends variant to model name instead of passing it as a separate property', async () => {
    setupMockSdkClient(minimalStreamChunks)
    const adapter = createAdapter()

    for await (const _ of chat({
      adapter,
      messages: [{ role: 'user', content: 'test' }],
      modelOptions: { variant: 'free' } as OpenRouterTextModelOptions,
    })) {
      // consume
    }

    const [rawParams] = mockSend.mock.calls[0]!
    const params = rawParams.chatRequest
    expect(params.model).toBe('openai/gpt-4o-mini:free')
  })

  it('forwards toolChoice to the SDK request', async () => {
    setupMockSdkClient(minimalStreamChunks)
    const adapter = createAdapter()

    const modelOptions: OpenRouterTextModelOptions = {
      toolChoice: 'required',
    }

    for await (const _ of chat({
      adapter,
      messages: [{ role: 'user', content: 'test' }],
      tools: [weatherTool],
      modelOptions,
    })) {
      // consume
    }

    const [rawParams] = mockSend.mock.calls[0]!
    const params = rawParams.chatRequest
    expect(params.toolChoice).toBe('required')
  })
})

describe('OpenRouter duplicate event prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not emit duplicate TEXT_MESSAGE_END when SDK sends separate usage chunk with finishReason', async () => {
    // Real-world pattern: OpenAI-compatible APIs often send a finish chunk
    // followed by a separate usage-only chunk, both with finishReason set.
    const streamChunks = [
      {
        id: 'chatcmpl-dup',
        model: 'openai/gpt-4o-mini',
        choices: [{ delta: { content: 'Hello' }, finishReason: null }],
      },
      {
        id: 'chatcmpl-dup',
        model: 'openai/gpt-4o-mini',
        choices: [{ delta: {}, finishReason: 'stop' }],
      },
      {
        // Separate usage chunk — also has finishReason
        id: 'chatcmpl-dup',
        model: 'openai/gpt-4o-mini',
        choices: [{ delta: {}, finishReason: 'stop' }],
        usage: { promptTokens: 5, completionTokens: 1, totalTokens: 6 },
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

    const textEndChunks = chunks.filter((c) => c.type === 'TEXT_MESSAGE_END')
    expect(textEndChunks).toHaveLength(1)
  })

  it('does not emit duplicate RUN_FINISHED when SDK sends separate usage chunk with finishReason', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-dup',
        model: 'openai/gpt-4o-mini',
        choices: [{ delta: { content: 'Hello' }, finishReason: null }],
      },
      {
        id: 'chatcmpl-dup',
        model: 'openai/gpt-4o-mini',
        choices: [{ delta: {}, finishReason: 'stop' }],
      },
      {
        id: 'chatcmpl-dup',
        model: 'openai/gpt-4o-mini',
        choices: [{ delta: {}, finishReason: 'stop' }],
        usage: { promptTokens: 5, completionTokens: 1, totalTokens: 6 },
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

    const runFinishedChunks = chunks.filter((c) => c.type === 'RUN_FINISHED')
    expect(runFinishedChunks).toHaveLength(1)
  })

  it('preserves usage data from the second finishReason chunk', async () => {
    // When the first finish chunk has no usage but the second does,
    // the single RUN_FINISHED should carry the usage from the second chunk.
    const streamChunks = [
      {
        id: 'chatcmpl-dup',
        model: 'openai/gpt-4o-mini',
        choices: [{ delta: { content: 'Hi' }, finishReason: null }],
      },
      {
        id: 'chatcmpl-dup',
        model: 'openai/gpt-4o-mini',
        choices: [{ delta: {}, finishReason: 'stop' }],
        // No usage on first finish chunk
      },
      {
        id: 'chatcmpl-dup',
        model: 'openai/gpt-4o-mini',
        choices: [{ delta: {}, finishReason: 'stop' }],
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      },
    ]

    setupMockSdkClient(streamChunks)
    const adapter = createAdapter()
    const chunks: Array<StreamChunk> = []

    for await (const chunk of adapter.chatStream({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      chunks.push(chunk)
    }

    const runFinished = chunks.filter((c) => c.type === 'RUN_FINISHED')
    expect(runFinished).toHaveLength(1)
    if (runFinished[0]?.type === 'RUN_FINISHED') {
      expect(runFinished[0].usage).toMatchObject({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      })
    }
  })

  it('ensures TEXT_MESSAGE_END comes before RUN_FINISHED even with duplicate finishReason chunks', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-dup',
        model: 'openai/gpt-4o-mini',
        choices: [{ delta: { content: 'Hello' }, finishReason: null }],
      },
      {
        id: 'chatcmpl-dup',
        model: 'openai/gpt-4o-mini',
        choices: [{ delta: {}, finishReason: 'stop' }],
      },
      {
        id: 'chatcmpl-dup',
        model: 'openai/gpt-4o-mini',
        choices: [{ delta: {}, finishReason: 'stop' }],
        usage: { promptTokens: 5, completionTokens: 1, totalTokens: 6 },
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

    const eventTypes = chunks.map((c) => c.type)
    const textEndIndex = eventTypes.lastIndexOf('TEXT_MESSAGE_END' as any)
    const runFinishedIndex = eventTypes.lastIndexOf('RUN_FINISHED' as any)

    expect(textEndIndex).toBeGreaterThan(-1)
    expect(runFinishedIndex).toBeGreaterThan(-1)
    expect(textEndIndex).toBeLessThan(runFinishedIndex)
  })
})

describe('OpenRouter STEP event consistency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('every STEP_FINISHED has a preceding STEP_STARTED', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-step',
        model: 'openai/o1-preview',
        choices: [
          {
            delta: {
              reasoningDetails: [
                { type: 'reasoning.text', text: 'Thinking...' },
              ],
            },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-step',
        model: 'openai/o1-preview',
        choices: [
          {
            delta: { content: 'Answer: 42' },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-step',
        model: 'openai/o1-preview',
        choices: [{ delta: {}, finishReason: 'stop' }],
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
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

    const eventTypes = chunks.map((c) => c.type)
    const stepFinishedIndices = eventTypes
      .map((t, i) => (t === 'STEP_FINISHED' ? i : -1))
      .filter((i) => i !== -1)
    const stepStartedIndices = eventTypes
      .map((t, i) => (t === 'STEP_STARTED' ? i : -1))
      .filter((i) => i !== -1)

    // Every STEP_FINISHED must have a STEP_STARTED before it
    expect(stepStartedIndices.length).toBeGreaterThan(0)
    for (const finIdx of stepFinishedIndices) {
      const hasMatchingStart = stepStartedIndices.some(
        (startIdx) => startIdx < finIdx,
      )
      expect(hasMatchingStart).toBe(true)
    }
  })

  it('emits exactly one STEP_STARTED and one STEP_FINISHED for multi-delta reasoning', async () => {
    // When multiple reasoning deltas arrive, the adapter should emit a
    // single STEP_STARTED/STEP_FINISHED pair — not one STEP_FINISHED per
    // delta.  A 1:N ratio causes verifiers to report orphan STEP_FINISHED.
    const streamChunks = [
      {
        id: 'chatcmpl-multi',
        model: 'openai/o1-preview',
        choices: [
          {
            delta: {
              reasoningDetails: [{ type: 'reasoning.text', text: 'Let me ' }],
            },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-multi',
        model: 'openai/o1-preview',
        choices: [
          {
            delta: {
              reasoningDetails: [
                { type: 'reasoning.text', text: 'think about ' },
              ],
            },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-multi',
        model: 'openai/o1-preview',
        choices: [
          {
            delta: {
              reasoningDetails: [{ type: 'reasoning.text', text: 'this...' }],
            },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-multi',
        model: 'openai/o1-preview',
        choices: [
          {
            delta: { content: 'The answer is 42.' },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-multi',
        model: 'openai/o1-preview',
        choices: [{ delta: {}, finishReason: 'stop' }],
        usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
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

    const stepStarted = chunks.filter((c) => c.type === 'STEP_STARTED')
    const stepFinished = chunks.filter((c) => c.type === 'STEP_FINISHED')

    expect(stepStarted).toHaveLength(1)
    expect(stepFinished).toHaveLength(1)
  })
})
