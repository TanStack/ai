import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { OpenAICompatibleChatCompletionsTextAdapter } from '../src/adapters/chat-completions-text'
import type { StreamChunk, Tool } from '@tanstack/ai'

// Declare mockCreate at module level
let mockCreate: ReturnType<typeof vi.fn>

// Mock the OpenAI SDK
vi.mock('openai', () => {
  return {
    default: class {
      chat = {
        completions: {
          create: (...args: Array<unknown>) => mockCreate(...args),
        },
      }
    },
  }
})

// Helper to create async iterable from chunks
function createAsyncIterable<T>(chunks: Array<T>): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0
      return {
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
  mockCreate = vi.fn().mockImplementation((params) => {
    if (params.stream) {
      return Promise.resolve(createAsyncIterable(streamChunks))
    }
    return Promise.resolve(nonStreamResponse)
  })
}

const testConfig = {
  apiKey: 'test-api-key',
  baseURL: 'https://api.test-provider.com/v1',
}

const weatherTool: Tool = {
  name: 'lookup_weather',
  description: 'Return the forecast for a location',
}

describe('OpenAICompatibleChatCompletionsTextAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('instantiation', () => {
    it('creates an adapter with default name', () => {
      const adapter = new OpenAICompatibleChatCompletionsTextAdapter(
        testConfig,
        'test-model',
      )

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('text')
      expect(adapter.name).toBe('openai-compatible')
      expect(adapter.model).toBe('test-model')
    })

    it('creates an adapter with custom name', () => {
      const adapter = new OpenAICompatibleChatCompletionsTextAdapter(
        testConfig,
        'test-model',
        'my-provider',
      )

      expect(adapter).toBeDefined()
      expect(adapter.name).toBe('my-provider')
    })

    it('creates an adapter with custom baseURL', () => {
      const adapter = new OpenAICompatibleChatCompletionsTextAdapter(
        {
          apiKey: 'test-key',
          baseURL: 'https://custom.api.example.com/v1',
        },
        'custom-model',
      )

      expect(adapter).toBeDefined()
      expect(adapter.model).toBe('custom-model')
    })
  })

  describe('streaming event sequence', () => {
    it('emits RUN_STARTED as the first event', async () => {
      const streamChunks = [
        {
          id: 'chatcmpl-123',
          model: 'test-model',
          choices: [
            {
              delta: { content: 'Hello' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-123',
          model: 'test-model',
          choices: [
            {
              delta: {},
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 1,
            total_tokens: 6,
          },
        },
      ]

      setupMockSdkClient(streamChunks)
      const adapter = new OpenAICompatibleChatCompletionsTextAdapter(
        testConfig,
        'test-model',
      )
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.chatStream({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
      })) {
        chunks.push(chunk)
      }

      expect(chunks[0]?.type).toBe('RUN_STARTED')
      if (chunks[0]?.type === 'RUN_STARTED') {
        expect(chunks[0].runId).toBeDefined()
        expect(chunks[0].model).toBe('test-model')
      }
    })

    it('emits TEXT_MESSAGE_START before TEXT_MESSAGE_CONTENT', async () => {
      const streamChunks = [
        {
          id: 'chatcmpl-123',
          model: 'test-model',
          choices: [
            {
              delta: { content: 'Hello' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-123',
          model: 'test-model',
          choices: [
            {
              delta: {},
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 1,
            total_tokens: 6,
          },
        },
      ]

      setupMockSdkClient(streamChunks)
      const adapter = new OpenAICompatibleChatCompletionsTextAdapter(
        testConfig,
        'test-model',
      )
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.chatStream({
        model: 'test-model',
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

    it('emits proper AG-UI event sequence: RUN_STARTED -> TEXT_MESSAGE_START -> TEXT_MESSAGE_CONTENT -> TEXT_MESSAGE_END -> RUN_FINISHED', async () => {
      const streamChunks = [
        {
          id: 'chatcmpl-123',
          model: 'test-model',
          choices: [
            {
              delta: { content: 'Hello world' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-123',
          model: 'test-model',
          choices: [
            {
              delta: {},
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 2,
            total_tokens: 7,
          },
        },
      ]

      setupMockSdkClient(streamChunks)
      const adapter = new OpenAICompatibleChatCompletionsTextAdapter(
        testConfig,
        'test-model',
      )
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.chatStream({
        model: 'test-model',
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

    it('emits TEXT_MESSAGE_END and RUN_FINISHED at the end with usage data', async () => {
      const streamChunks = [
        {
          id: 'chatcmpl-123',
          model: 'test-model',
          choices: [
            {
              delta: { content: 'Hello' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-123',
          model: 'test-model',
          choices: [
            {
              delta: {},
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 1,
            total_tokens: 6,
          },
        },
      ]

      setupMockSdkClient(streamChunks)
      const adapter = new OpenAICompatibleChatCompletionsTextAdapter(
        testConfig,
        'test-model',
      )
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.chatStream({
        model: 'test-model',
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

    it('streams content with correct accumulated values', async () => {
      const streamChunks = [
        {
          id: 'chatcmpl-stream',
          model: 'test-model',
          choices: [
            {
              delta: { content: 'Hello ' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-stream',
          model: 'test-model',
          choices: [
            {
              delta: { content: 'world' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-stream',
          model: 'test-model',
          choices: [
            {
              delta: {},
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 2,
            total_tokens: 7,
          },
        },
      ]

      setupMockSdkClient(streamChunks)
      const adapter = new OpenAICompatibleChatCompletionsTextAdapter(
        testConfig,
        'test-model',
      )
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.chatStream({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Say hello' }],
      })) {
        chunks.push(chunk)
      }

      // Check TEXT_MESSAGE_CONTENT events have correct accumulated content
      const contentChunks = chunks.filter(
        (c) => c.type === 'TEXT_MESSAGE_CONTENT',
      )
      expect(contentChunks.length).toBe(2)

      const firstContent = contentChunks[0]
      if (firstContent?.type === 'TEXT_MESSAGE_CONTENT') {
        expect(firstContent.delta).toBe('Hello ')
        expect(firstContent.content).toBe('Hello ')
      }

      const secondContent = contentChunks[1]
      if (secondContent?.type === 'TEXT_MESSAGE_CONTENT') {
        expect(secondContent.delta).toBe('world')
        expect(secondContent.content).toBe('Hello world')
      }
    })
  })

  describe('tool call events', () => {
    it('emits TOOL_CALL_START -> TOOL_CALL_ARGS -> TOOL_CALL_END', async () => {
      const streamChunks = [
        {
          id: 'chatcmpl-456',
          model: 'test-model',
          choices: [
            {
              delta: {
                tool_calls: [
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
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-456',
          model: 'test-model',
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: {
                      arguments: '"Berlin"}',
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-456',
          model: 'test-model',
          choices: [
            {
              delta: {},
              finish_reason: 'tool_calls',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        },
      ]

      setupMockSdkClient(streamChunks)
      const adapter = new OpenAICompatibleChatCompletionsTextAdapter(
        testConfig,
        'test-model',
      )
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.chatStream({
        model: 'test-model',
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
  })

  describe('error handling', () => {
    it('emits RUN_ERROR on stream error', async () => {
      const streamChunks = [
        {
          id: 'chatcmpl-123',
          model: 'test-model',
          choices: [
            {
              delta: { content: 'Hello' },
              finish_reason: null,
            },
          ],
        },
      ]

      // Create an async iterable that throws mid-stream
      const errorIterable = {
        [Symbol.asyncIterator]() {
          let index = 0
          return {
            async next() {
              if (index < streamChunks.length) {
                return { value: streamChunks[index++]!, done: false }
              }
              throw new Error('Stream interrupted')
            },
          }
        },
      }

      mockCreate = vi.fn().mockResolvedValue(errorIterable)

      const adapter = new OpenAICompatibleChatCompletionsTextAdapter(
        testConfig,
        'test-model',
      )
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.chatStream({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
      })) {
        chunks.push(chunk)
      }

      // Should emit RUN_ERROR
      const runErrorChunk = chunks.find((c) => c.type === 'RUN_ERROR')
      expect(runErrorChunk).toBeDefined()
      if (runErrorChunk?.type === 'RUN_ERROR') {
        expect(runErrorChunk.error.message).toBe('Stream interrupted')
      }
    })

    it('emits RUN_STARTED then RUN_ERROR when client.create throws', async () => {
      mockCreate = vi.fn().mockRejectedValue(new Error('API key invalid'))

      const adapter = new OpenAICompatibleChatCompletionsTextAdapter(
        testConfig,
        'test-model',
      )
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.chatStream({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
      })) {
        chunks.push(chunk)
      }

      // Should have RUN_STARTED followed by RUN_ERROR
      expect(chunks.length).toBe(2)
      expect(chunks[0]?.type).toBe('RUN_STARTED')
      expect(chunks[1]?.type).toBe('RUN_ERROR')
      if (chunks[1]?.type === 'RUN_ERROR') {
        expect(chunks[1].error.message).toBe('API key invalid')
      }
    })
  })

  describe('structured output', () => {
    it('generates structured output and parses JSON response', async () => {
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

      const adapter = new OpenAICompatibleChatCompletionsTextAdapter(
        testConfig,
        'test-model',
      )

      const result = await adapter.structuredOutput({
        chatOptions: {
          model: 'test-model',
          messages: [{ role: 'user', content: 'Give me a person object' }],
        },
        outputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
          required: ['name', 'age'],
        },
      })

      expect(result.data).toEqual({ name: 'Alice', age: 30 })
      expect(result.rawText).toBe('{"name":"Alice","age":30}')

      // Verify stream: false was passed (second arg is request options)
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: false,
          response_format: expect.objectContaining({
            type: 'json_schema',
          }),
        }),
        expect.anything(),
      )
    })

    it('transforms null values to undefined', async () => {
      const nonStreamResponse = {
        choices: [
          {
            message: {
              content: '{"name":"Alice","nickname":null}',
            },
          },
        ],
      }

      setupMockSdkClient([], nonStreamResponse)

      const adapter = new OpenAICompatibleChatCompletionsTextAdapter(
        testConfig,
        'test-model',
      )

      const result = await adapter.structuredOutput({
        chatOptions: {
          model: 'test-model',
          messages: [{ role: 'user', content: 'Give me a person object' }],
        },
        outputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            nickname: { type: 'string' },
          },
          required: ['name'],
        },
      })

      // null should be transformed to undefined
      expect((result.data as any).name).toBe('Alice')
      expect((result.data as any).nickname).toBeUndefined()
    })

    it('throws on invalid JSON response', async () => {
      const nonStreamResponse = {
        choices: [
          {
            message: {
              content: 'not valid json',
            },
          },
        ],
      }

      setupMockSdkClient([], nonStreamResponse)

      const adapter = new OpenAICompatibleChatCompletionsTextAdapter(
        testConfig,
        'test-model',
      )

      await expect(
        adapter.structuredOutput({
          chatOptions: {
            model: 'test-model',
            messages: [{ role: 'user', content: 'Give me a person object' }],
          },
          outputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            required: ['name'],
          },
        }),
      ).rejects.toThrow('Failed to parse structured output as JSON')
    })
  })

  describe('subclassing', () => {
    it('allows subclassing with custom name', () => {
      class MyProviderAdapter extends OpenAICompatibleChatCompletionsTextAdapter<string> {
        constructor(apiKey: string, model: string) {
          super(
            { apiKey, baseURL: 'https://my-provider.com/v1' },
            model,
            'my-provider',
          )
        }
      }

      const adapter = new MyProviderAdapter('test-key', 'my-model')
      expect(adapter.name).toBe('my-provider')
      expect(adapter.kind).toBe('text')
      expect(adapter.model).toBe('my-model')
    })
  })

  describe('request forwarding', () => {
    it('forwards modelOptions to the API request', async () => {
      const streamChunks = [
        {
          id: 'chatcmpl-123',
          model: 'test-model',
          choices: [{ delta: { content: 'Hi' }, finish_reason: null }],
        },
        {
          id: 'chatcmpl-123',
          model: 'test-model',
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
        },
      ]

      setupMockSdkClient(streamChunks)
      const adapter = new OpenAICompatibleChatCompletionsTextAdapter(
        testConfig,
        'test-model',
      )

      const chunks: Array<StreamChunk> = []
      for await (const chunk of adapter.chatStream({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
        modelOptions: { frequency_penalty: 0.5, presence_penalty: 0.3 },
      })) {
        chunks.push(chunk)
      }

      // Verify modelOptions were forwarded
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          frequency_penalty: 0.5,
          presence_penalty: 0.3,
        }),
        expect.anything(),
      )
    })

    it('includes stream_options only for streaming calls', async () => {
      const streamChunks = [
        {
          id: 'chatcmpl-123',
          model: 'test-model',
          choices: [{ delta: { content: 'Hi' }, finish_reason: null }],
        },
        {
          id: 'chatcmpl-123',
          model: 'test-model',
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
        },
      ]

      setupMockSdkClient(streamChunks)
      const adapter = new OpenAICompatibleChatCompletionsTextAdapter(
        testConfig,
        'test-model',
      )

      const chunks: Array<StreamChunk> = []
      for await (const chunk of adapter.chatStream({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
      })) {
        chunks.push(chunk)
      }

      // Streaming call should include stream_options
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: true,
          stream_options: { include_usage: true },
        }),
        expect.anything(),
      )
    })

    it('does not include stream_options in structured output calls', async () => {
      const nonStreamResponse = {
        choices: [{ message: { content: '{"name":"Alice"}' } }],
      }

      setupMockSdkClient([], nonStreamResponse)

      const adapter = new OpenAICompatibleChatCompletionsTextAdapter(
        testConfig,
        'test-model',
      )

      await adapter.structuredOutput({
        chatOptions: {
          model: 'test-model',
          messages: [{ role: 'user', content: 'Give me a person' }],
        },
        outputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
      })

      // Structured output call should NOT have stream_options
      const callArgs = mockCreate.mock.calls[0]?.[0]
      expect(callArgs.stream).toBe(false)
      expect(callArgs.stream_options).toBeUndefined()
    })

    it('forwards request headers and signal to SDK create calls', async () => {
      const streamChunks = [
        {
          id: 'chatcmpl-123',
          model: 'test-model',
          choices: [{ delta: { content: 'Hi' }, finish_reason: null }],
        },
        {
          id: 'chatcmpl-123',
          model: 'test-model',
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
        },
      ]

      setupMockSdkClient(streamChunks)
      const adapter = new OpenAICompatibleChatCompletionsTextAdapter(
        testConfig,
        'test-model',
      )

      const controller = new AbortController()
      const chunks: Array<StreamChunk> = []
      for await (const chunk of adapter.chatStream({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
        request: {
          headers: { 'X-Custom-Header': 'test-value' },
          signal: controller.signal,
        },
      })) {
        chunks.push(chunk)
      }

      // Verify second argument contains headers and signal
      const requestOptions = mockCreate.mock.calls[0]?.[1]
      expect(requestOptions).toBeDefined()
      expect(requestOptions.headers).toEqual({
        'X-Custom-Header': 'test-value',
      })
      expect(requestOptions.signal).toBe(controller.signal)
    })
  })
})
