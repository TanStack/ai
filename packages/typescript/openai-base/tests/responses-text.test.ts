import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { OpenAICompatibleResponsesTextAdapter } from '../src/adapters/responses-text'
import type { StreamChunk, Tool } from '@tanstack/ai'

// Declare mockCreate at module level
let mockResponsesCreate: ReturnType<typeof vi.fn>

// Mock the OpenAI SDK
vi.mock('openai', () => {
  return {
    default: class {
      responses = {
        create: (...args: Array<unknown>) => mockResponsesCreate(...args),
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

// Helper to setup the mock SDK client for streaming/non-streaming responses
function setupMockResponsesClient(
  streamChunks: Array<Record<string, unknown>>,
  nonStreamResponse?: Record<string, unknown>,
) {
  mockResponsesCreate = vi.fn().mockImplementation((params) => {
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

describe('OpenAICompatibleResponsesTextAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('instantiation', () => {
    it('creates an adapter with default name', () => {
      const adapter = new OpenAICompatibleResponsesTextAdapter(
        testConfig,
        'test-model',
      )

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('text')
      expect(adapter.name).toBe('openai-compatible-responses')
      expect(adapter.model).toBe('test-model')
    })

    it('creates an adapter with custom name', () => {
      const adapter = new OpenAICompatibleResponsesTextAdapter(
        testConfig,
        'test-model',
        'my-provider',
      )

      expect(adapter).toBeDefined()
      expect(adapter.name).toBe('my-provider')
    })

    it('creates an adapter with custom baseURL', () => {
      const adapter = new OpenAICompatibleResponsesTextAdapter(
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
          type: 'response.created',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'in_progress',
          },
        },
        {
          type: 'response.output_text.delta',
          delta: 'Hello',
        },
        {
          type: 'response.completed',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'completed',
            output: [],
            usage: {
              input_tokens: 5,
              output_tokens: 1,
              total_tokens: 6,
            },
          },
        },
      ]

      setupMockResponsesClient(streamChunks)
      const adapter = new OpenAICompatibleResponsesTextAdapter(
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

    it('emits TEXT_MESSAGE_START before TEXT_MESSAGE_CONTENT on output_text.delta', async () => {
      const streamChunks = [
        {
          type: 'response.created',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'in_progress',
          },
        },
        {
          type: 'response.output_text.delta',
          delta: 'Hello',
        },
        {
          type: 'response.completed',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'completed',
            output: [],
            usage: {
              input_tokens: 5,
              output_tokens: 1,
              total_tokens: 6,
            },
          },
        },
      ]

      setupMockResponsesClient(streamChunks)
      const adapter = new OpenAICompatibleResponsesTextAdapter(
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
          type: 'response.created',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'in_progress',
          },
        },
        {
          type: 'response.output_text.delta',
          delta: 'Hello world',
        },
        {
          type: 'response.completed',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'completed',
            output: [],
            usage: {
              input_tokens: 5,
              output_tokens: 2,
              total_tokens: 7,
            },
          },
        },
      ]

      setupMockResponsesClient(streamChunks)
      const adapter = new OpenAICompatibleResponsesTextAdapter(
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
          type: 'response.created',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'in_progress',
          },
        },
        {
          type: 'response.output_text.delta',
          delta: 'Hello',
        },
        {
          type: 'response.completed',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'completed',
            output: [],
            usage: {
              input_tokens: 5,
              output_tokens: 1,
              total_tokens: 6,
            },
          },
        },
      ]

      setupMockResponsesClient(streamChunks)
      const adapter = new OpenAICompatibleResponsesTextAdapter(
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
          type: 'response.created',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'in_progress',
          },
        },
        {
          type: 'response.output_text.delta',
          delta: 'Hello ',
        },
        {
          type: 'response.output_text.delta',
          delta: 'world',
        },
        {
          type: 'response.completed',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'completed',
            output: [],
            usage: {
              input_tokens: 5,
              output_tokens: 2,
              total_tokens: 7,
            },
          },
        },
      ]

      setupMockResponsesClient(streamChunks)
      const adapter = new OpenAICompatibleResponsesTextAdapter(
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

  describe('reasoning/thinking tokens', () => {
    it('emits STEP_STARTED and STEP_FINISHED for reasoning_text.delta', async () => {
      const streamChunks = [
        {
          type: 'response.created',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'in_progress',
          },
        },
        {
          type: 'response.reasoning_text.delta',
          delta: 'Let me think about this...',
        },
        {
          type: 'response.reasoning_text.delta',
          delta: ' The answer is clear.',
        },
        {
          type: 'response.output_text.delta',
          delta: 'The answer is 42.',
        },
        {
          type: 'response.completed',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'completed',
            output: [],
            usage: {
              input_tokens: 10,
              output_tokens: 20,
              total_tokens: 30,
            },
          },
        },
      ]

      setupMockResponsesClient(streamChunks)
      const adapter = new OpenAICompatibleResponsesTextAdapter(
        testConfig,
        'test-model',
      )
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.chatStream({
        model: 'test-model',
        messages: [{ role: 'user', content: 'What is the meaning of life?' }],
      })) {
        chunks.push(chunk)
      }

      const eventTypes = chunks.map((c) => c.type)

      // Should have STEP_STARTED for reasoning
      const stepStartIndex = eventTypes.indexOf('STEP_STARTED')
      expect(stepStartIndex).toBeGreaterThan(-1)

      const stepStart = chunks[stepStartIndex]
      if (stepStart?.type === 'STEP_STARTED') {
        expect(stepStart.stepId).toBeDefined()
        expect(stepStart.stepType).toBe('thinking')
      }

      // Should have STEP_FINISHED events for reasoning deltas
      const stepFinished = chunks.filter((c) => c.type === 'STEP_FINISHED')
      expect(stepFinished.length).toBe(2)

      // Check accumulated reasoning
      if (stepFinished[0]?.type === 'STEP_FINISHED') {
        expect(stepFinished[0].delta).toBe('Let me think about this...')
        expect(stepFinished[0].content).toBe('Let me think about this...')
      }
      if (stepFinished[1]?.type === 'STEP_FINISHED') {
        expect(stepFinished[1].delta).toBe(' The answer is clear.')
        expect(stepFinished[1].content).toBe(
          'Let me think about this... The answer is clear.',
        )
      }

      // Should also have text content
      const textContent = chunks.filter(
        (c) => c.type === 'TEXT_MESSAGE_CONTENT',
      )
      expect(textContent.length).toBe(1)
    })

    it('emits STEP_STARTED and STEP_FINISHED for reasoning_summary_text.delta', async () => {
      const streamChunks = [
        {
          type: 'response.created',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'in_progress',
          },
        },
        {
          type: 'response.reasoning_summary_text.delta',
          delta: 'Summary of reasoning...',
        },
        {
          type: 'response.output_text.delta',
          delta: 'Final answer.',
        },
        {
          type: 'response.completed',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'completed',
            output: [],
            usage: {
              input_tokens: 5,
              output_tokens: 2,
              total_tokens: 7,
            },
          },
        },
      ]

      setupMockResponsesClient(streamChunks)
      const adapter = new OpenAICompatibleResponsesTextAdapter(
        testConfig,
        'test-model',
      )
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.chatStream({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Explain' }],
      })) {
        chunks.push(chunk)
      }

      const stepStart = chunks.find((c) => c.type === 'STEP_STARTED')
      expect(stepStart).toBeDefined()
      if (stepStart?.type === 'STEP_STARTED') {
        expect(stepStart.stepType).toBe('thinking')
      }

      const stepFinished = chunks.filter((c) => c.type === 'STEP_FINISHED')
      expect(stepFinished.length).toBe(1)
      if (stepFinished[0]?.type === 'STEP_FINISHED') {
        expect(stepFinished[0].delta).toBe('Summary of reasoning...')
      }
    })
  })

  describe('tool call events', () => {
    it('emits TOOL_CALL_START -> TOOL_CALL_ARGS -> TOOL_CALL_END', async () => {
      const streamChunks = [
        {
          type: 'response.created',
          response: {
            id: 'resp-456',
            model: 'test-model',
            status: 'in_progress',
          },
        },
        {
          type: 'response.output_item.added',
          output_index: 0,
          item: {
            type: 'function_call',
            id: 'call_abc123',
            name: 'lookup_weather',
          },
        },
        {
          type: 'response.function_call_arguments.delta',
          item_id: 'call_abc123',
          delta: '{"location":',
        },
        {
          type: 'response.function_call_arguments.delta',
          item_id: 'call_abc123',
          delta: '"Berlin"}',
        },
        {
          type: 'response.function_call_arguments.done',
          item_id: 'call_abc123',
          arguments: '{"location":"Berlin"}',
        },
        {
          type: 'response.completed',
          response: {
            id: 'resp-456',
            model: 'test-model',
            status: 'completed',
            output: [
              {
                type: 'function_call',
                id: 'call_abc123',
                name: 'lookup_weather',
                arguments: '{"location":"Berlin"}',
              },
            ],
            usage: {
              input_tokens: 10,
              output_tokens: 5,
              total_tokens: 15,
            },
          },
        },
      ]

      setupMockResponsesClient(streamChunks)
      const adapter = new OpenAICompatibleResponsesTextAdapter(
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
        expect(toolStartChunk.index).toBe(0)
      }

      const toolArgsChunks = chunks.filter((c) => c.type === 'TOOL_CALL_ARGS')
      expect(toolArgsChunks.length).toBe(2)
      if (toolArgsChunks[0]?.type === 'TOOL_CALL_ARGS') {
        expect(toolArgsChunks[0].delta).toBe('{"location":')
      }
      if (toolArgsChunks[1]?.type === 'TOOL_CALL_ARGS') {
        expect(toolArgsChunks[1].delta).toBe('"Berlin"}')
      }

      const toolEndChunk = chunks.find((c) => c.type === 'TOOL_CALL_END')
      expect(toolEndChunk).toBeDefined()
      if (toolEndChunk?.type === 'TOOL_CALL_END') {
        expect(toolEndChunk.toolCallId).toBe('call_abc123')
        expect(toolEndChunk.toolName).toBe('lookup_weather')
        expect(toolEndChunk.input).toEqual({ location: 'Berlin' })
      }

      // Check finish reason is tool_calls when output contains function_call items
      const runFinishedChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
      if (runFinishedChunk?.type === 'RUN_FINISHED') {
        expect(runFinishedChunk.finishReason).toBe('tool_calls')
      }
    })

    it('handles multiple parallel tool calls', async () => {
      const streamChunks = [
        {
          type: 'response.created',
          response: {
            id: 'resp-789',
            model: 'test-model',
            status: 'in_progress',
          },
        },
        {
          type: 'response.output_item.added',
          output_index: 0,
          item: {
            type: 'function_call',
            id: 'call_1',
            name: 'lookup_weather',
          },
        },
        {
          type: 'response.output_item.added',
          output_index: 1,
          item: {
            type: 'function_call',
            id: 'call_2',
            name: 'lookup_weather',
          },
        },
        {
          type: 'response.function_call_arguments.delta',
          item_id: 'call_1',
          delta: '{"location":"Berlin"}',
        },
        {
          type: 'response.function_call_arguments.delta',
          item_id: 'call_2',
          delta: '{"location":"Paris"}',
        },
        {
          type: 'response.function_call_arguments.done',
          item_id: 'call_1',
          arguments: '{"location":"Berlin"}',
        },
        {
          type: 'response.function_call_arguments.done',
          item_id: 'call_2',
          arguments: '{"location":"Paris"}',
        },
        {
          type: 'response.completed',
          response: {
            id: 'resp-789',
            model: 'test-model',
            status: 'completed',
            output: [
              {
                type: 'function_call',
                id: 'call_1',
                name: 'lookup_weather',
                arguments: '{"location":"Berlin"}',
              },
              {
                type: 'function_call',
                id: 'call_2',
                name: 'lookup_weather',
                arguments: '{"location":"Paris"}',
              },
            ],
            usage: {
              input_tokens: 10,
              output_tokens: 10,
              total_tokens: 20,
            },
          },
        },
      ]

      setupMockResponsesClient(streamChunks)
      const adapter = new OpenAICompatibleResponsesTextAdapter(
        testConfig,
        'test-model',
      )
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.chatStream({
        model: 'test-model',
        messages: [
          {
            role: 'user',
            content: 'Weather in Berlin and Paris?',
          },
        ],
        tools: [weatherTool],
      })) {
        chunks.push(chunk)
      }

      const toolStarts = chunks.filter((c) => c.type === 'TOOL_CALL_START')
      expect(toolStarts.length).toBe(2)

      const toolEnds = chunks.filter((c) => c.type === 'TOOL_CALL_END')
      expect(toolEnds.length).toBe(2)

      if (toolEnds[0]?.type === 'TOOL_CALL_END') {
        expect(toolEnds[0].input).toEqual({ location: 'Berlin' })
      }
      if (toolEnds[1]?.type === 'TOOL_CALL_END') {
        expect(toolEnds[1].input).toEqual({ location: 'Paris' })
      }
    })

    it('uses call_id instead of internal id for tool call correlation', async () => {
      const streamChunks = [
        {
          type: 'response.created',
          response: {
            id: 'resp-callid',
            model: 'test-model',
            status: 'in_progress',
          },
        },
        {
          type: 'response.output_item.added',
          output_index: 0,
          item: {
            type: 'function_call',
            id: 'fc_internal_001',
            call_id: 'call_api_abc123',
            name: 'lookup_weather',
          },
        },
        {
          type: 'response.function_call_arguments.delta',
          item_id: 'fc_internal_001',
          delta: '{"location":"Tokyo"}',
        },
        {
          type: 'response.function_call_arguments.done',
          item_id: 'fc_internal_001',
          arguments: '{"location":"Tokyo"}',
        },
        {
          type: 'response.completed',
          response: {
            id: 'resp-callid',
            model: 'test-model',
            status: 'completed',
            output: [
              {
                type: 'function_call',
                id: 'fc_internal_001',
                call_id: 'call_api_abc123',
                name: 'lookup_weather',
                arguments: '{"location":"Tokyo"}',
              },
            ],
            usage: {
              input_tokens: 10,
              output_tokens: 5,
              total_tokens: 15,
            },
          },
        },
      ]

      setupMockResponsesClient(streamChunks)
      const adapter = new OpenAICompatibleResponsesTextAdapter(
        testConfig,
        'test-model',
      )
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.chatStream({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Weather in Tokyo?' }],
        tools: [weatherTool],
      })) {
        chunks.push(chunk)
      }

      // TOOL_CALL_START should use call_id, not internal id
      const toolStart = chunks.find((c) => c.type === 'TOOL_CALL_START')
      expect(toolStart).toBeDefined()
      if (toolStart?.type === 'TOOL_CALL_START') {
        expect(toolStart.toolCallId).toBe('call_api_abc123')
        expect(toolStart.toolCallId).not.toBe('fc_internal_001')
      }

      // TOOL_CALL_ARGS should also use call_id
      const toolArgs = chunks.filter((c) => c.type === 'TOOL_CALL_ARGS')
      expect(toolArgs.length).toBeGreaterThan(0)
      if (toolArgs[0]?.type === 'TOOL_CALL_ARGS') {
        expect(toolArgs[0].toolCallId).toBe('call_api_abc123')
      }

      // TOOL_CALL_END should also use call_id
      const toolEnd = chunks.find((c) => c.type === 'TOOL_CALL_END')
      expect(toolEnd).toBeDefined()
      if (toolEnd?.type === 'TOOL_CALL_END') {
        expect(toolEnd.toolCallId).toBe('call_api_abc123')
        expect(toolEnd.toolCallId).not.toBe('fc_internal_001')
      }
    })
  })

  describe('content_part events', () => {
    it('emits TEXT_MESSAGE_START on content_part.added with output_text', async () => {
      const streamChunks = [
        {
          type: 'response.created',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'in_progress',
          },
        },
        {
          type: 'response.content_part.added',
          part: {
            type: 'output_text',
            text: 'It is sunny',
          },
        },
        {
          type: 'response.completed',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'completed',
            output: [],
            usage: {
              input_tokens: 5,
              output_tokens: 3,
              total_tokens: 8,
            },
          },
        },
      ]

      setupMockResponsesClient(streamChunks)
      const adapter = new OpenAICompatibleResponsesTextAdapter(
        testConfig,
        'test-model',
      )
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.chatStream({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Weather?' }],
      })) {
        chunks.push(chunk)
      }

      const eventTypes = chunks.map((c) => c.type)
      expect(eventTypes).toContain('TEXT_MESSAGE_START')
      expect(eventTypes).toContain('TEXT_MESSAGE_CONTENT')

      // TEXT_MESSAGE_START should be before TEXT_MESSAGE_CONTENT
      const startIdx = eventTypes.indexOf('TEXT_MESSAGE_START')
      const contentIdx = eventTypes.indexOf('TEXT_MESSAGE_CONTENT')
      expect(startIdx).toBeLessThan(contentIdx)
    })

    it('skips content_part.done when deltas were already streamed', async () => {
      const streamChunks = [
        {
          type: 'response.created',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'in_progress',
          },
        },
        {
          type: 'response.output_text.delta',
          delta: 'Hello',
        },
        {
          type: 'response.output_text.delta',
          delta: ' world',
        },
        {
          type: 'response.content_part.done',
          part: {
            type: 'output_text',
            text: 'Hello world',
          },
        },
        {
          type: 'response.completed',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'completed',
            output: [],
            usage: {
              input_tokens: 5,
              output_tokens: 2,
              total_tokens: 7,
            },
          },
        },
      ]

      setupMockResponsesClient(streamChunks)
      const adapter = new OpenAICompatibleResponsesTextAdapter(
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

      // Should only have 2 TEXT_MESSAGE_CONTENT events (from deltas), not 3
      const contentChunks = chunks.filter(
        (c) => c.type === 'TEXT_MESSAGE_CONTENT',
      )
      expect(contentChunks.length).toBe(2)
    })
  })

  describe('error handling', () => {
    it('emits RUN_ERROR on stream error', async () => {
      const streamChunks = [
        {
          type: 'response.created',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'in_progress',
          },
        },
        {
          type: 'response.output_text.delta',
          delta: 'Hello',
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

      mockResponsesCreate = vi.fn().mockResolvedValue(errorIterable)

      const adapter = new OpenAICompatibleResponsesTextAdapter(
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
      mockResponsesCreate = vi
        .fn()
        .mockRejectedValue(new Error('API key invalid'))

      const adapter = new OpenAICompatibleResponsesTextAdapter(
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

    it('emits RUN_ERROR on response.failed event', async () => {
      const streamChunks = [
        {
          type: 'response.failed',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'failed',
            error: {
              message: 'Content policy violation',
              code: 'content_filter',
            },
          },
        },
      ]

      setupMockResponsesClient(streamChunks)
      const adapter = new OpenAICompatibleResponsesTextAdapter(
        testConfig,
        'test-model',
      )
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.chatStream({
        model: 'test-model',
        messages: [{ role: 'user', content: 'bad content' }],
      })) {
        chunks.push(chunk)
      }

      const errorChunk = chunks.find((c) => c.type === 'RUN_ERROR')
      expect(errorChunk).toBeDefined()
      if (errorChunk?.type === 'RUN_ERROR') {
        expect(errorChunk.error.message).toBe('Content policy violation')
      }
    })

    it('emits RUN_ERROR on response.incomplete event', async () => {
      const streamChunks = [
        {
          type: 'response.incomplete',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'incomplete',
            incomplete_details: {
              reason: 'max_output_tokens',
            },
          },
        },
      ]

      setupMockResponsesClient(streamChunks)
      const adapter = new OpenAICompatibleResponsesTextAdapter(
        testConfig,
        'test-model',
      )
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.chatStream({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Write a long story' }],
      })) {
        chunks.push(chunk)
      }

      const errorChunks = chunks.filter((c) => c.type === 'RUN_ERROR')
      expect(errorChunks.length).toBeGreaterThan(0)
      const incompleteError = errorChunks.find(
        (c) =>
          c.type === 'RUN_ERROR' && c.error.message === 'max_output_tokens',
      )
      expect(incompleteError).toBeDefined()
    })

    it('emits RUN_ERROR on error event type', async () => {
      const streamChunks = [
        {
          type: 'response.created',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'in_progress',
          },
        },
        {
          type: 'error',
          message: 'Rate limit exceeded',
          code: 'rate_limit',
        },
      ]

      setupMockResponsesClient(streamChunks)
      const adapter = new OpenAICompatibleResponsesTextAdapter(
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

      const errorChunk = chunks.find(
        (c) =>
          c.type === 'RUN_ERROR' && c.error.message === 'Rate limit exceeded',
      )
      expect(errorChunk).toBeDefined()
      if (errorChunk?.type === 'RUN_ERROR') {
        expect(errorChunk.error.code).toBe('rate_limit')
      }
    })
  })

  describe('structured output', () => {
    it('generates structured output and parses JSON response', async () => {
      const nonStreamResponse = {
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: '{"name":"Alice","age":30}',
              },
            ],
          },
        ],
      }

      setupMockResponsesClient([], nonStreamResponse)

      const adapter = new OpenAICompatibleResponsesTextAdapter(
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

      // Verify text.format was passed (Responses API format)
      expect(mockResponsesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: false,
          text: expect.objectContaining({
            format: expect.objectContaining({
              type: 'json_schema',
              name: 'structured_output',
              strict: true,
            }),
          }),
        }),
        expect.anything(),
      )
    })

    it('transforms null values to undefined', async () => {
      const nonStreamResponse = {
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: '{"name":"Alice","nickname":null}',
              },
            ],
          },
        ],
      }

      setupMockResponsesClient([], nonStreamResponse)

      const adapter = new OpenAICompatibleResponsesTextAdapter(
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
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: 'not valid json',
              },
            ],
          },
        ],
      }

      setupMockResponsesClient([], nonStreamResponse)

      const adapter = new OpenAICompatibleResponsesTextAdapter(
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

  describe('request mapping', () => {
    it('maps options to Responses API payload format', async () => {
      const streamChunks = [
        {
          type: 'response.created',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'in_progress',
          },
        },
        {
          type: 'response.completed',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'completed',
            output: [],
            usage: {
              input_tokens: 5,
              output_tokens: 1,
              total_tokens: 6,
            },
          },
        },
      ]

      setupMockResponsesClient(streamChunks)
      const adapter = new OpenAICompatibleResponsesTextAdapter(
        testConfig,
        'test-model',
      )

      const chunks: Array<StreamChunk> = []
      for await (const chunk of adapter.chatStream({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.5,
        topP: 0.9,
        maxTokens: 1024,
        systemPrompts: ['Be helpful'],
        tools: [weatherTool],
      })) {
        chunks.push(chunk)
      }

      expect(mockResponsesCreate).toHaveBeenCalledTimes(1)
      const [payload] = mockResponsesCreate.mock.calls[0]

      // Verify Responses API field names
      expect(payload).toMatchObject({
        model: 'test-model',
        temperature: 0.5,
        top_p: 0.9,
        max_output_tokens: 1024,
        stream: true,
        instructions: 'Be helpful',
      })

      // Responses API uses 'input' instead of 'messages'
      expect(payload.input).toBeDefined()
      expect(Array.isArray(payload.input)).toBe(true)

      // Verify tools are included
      expect(payload.tools).toBeDefined()
      expect(Array.isArray(payload.tools)).toBe(true)
      expect(payload.tools.length).toBe(1)
      expect(payload.tools[0].type).toBe('function')
      expect(payload.tools[0].name).toBe('lookup_weather')
    })

    it('converts user messages to input_text format', async () => {
      const streamChunks = [
        {
          type: 'response.created',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'in_progress',
          },
        },
        {
          type: 'response.completed',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'completed',
            output: [],
            usage: {
              input_tokens: 5,
              output_tokens: 1,
              total_tokens: 6,
            },
          },
        },
      ]

      setupMockResponsesClient(streamChunks)
      const adapter = new OpenAICompatibleResponsesTextAdapter(
        testConfig,
        'test-model',
      )

      const chunks: Array<StreamChunk> = []
      for await (const chunk of adapter.chatStream({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello world' }],
      })) {
        chunks.push(chunk)
      }

      const [payload] = mockResponsesCreate.mock.calls[0]
      expect(payload.input).toEqual([
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Hello world' }],
        },
      ])
    })

    it('converts assistant messages with tool calls to function_call format', async () => {
      const streamChunks = [
        {
          type: 'response.created',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'in_progress',
          },
        },
        {
          type: 'response.completed',
          response: {
            id: 'resp-123',
            model: 'test-model',
            status: 'completed',
            output: [],
            usage: {
              input_tokens: 10,
              output_tokens: 1,
              total_tokens: 11,
            },
          },
        },
      ]

      setupMockResponsesClient(streamChunks)
      const adapter = new OpenAICompatibleResponsesTextAdapter(
        testConfig,
        'test-model',
      )

      const chunks: Array<StreamChunk> = []
      for await (const chunk of adapter.chatStream({
        model: 'test-model',
        messages: [
          {
            role: 'assistant',
            content: 'Let me check',
            toolCalls: [
              {
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'lookup_weather',
                  arguments: '{"location":"Berlin"}',
                },
              },
            ],
          },
          {
            role: 'tool',
            toolCallId: 'call_123',
            content: '{"temp":72}',
          },
        ],
      })) {
        chunks.push(chunk)
      }

      const [payload] = mockResponsesCreate.mock.calls[0]
      // Should have function_call, message, and function_call_output
      expect(payload.input).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'function_call',
            call_id: 'call_123',
            name: 'lookup_weather',
            arguments: '{"location":"Berlin"}',
          }),
          expect.objectContaining({
            type: 'message',
            role: 'assistant',
            content: 'Let me check',
          }),
          expect.objectContaining({
            type: 'function_call_output',
            call_id: 'call_123',
            output: '{"temp":72}',
          }),
        ]),
      )
    })
  })

  describe('subclassing', () => {
    it('allows subclassing with custom name', () => {
      class MyProviderAdapter extends OpenAICompatibleResponsesTextAdapter<string> {
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
})
