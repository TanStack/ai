import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  GrokTextAdapter,
  createGrokText,
  grokText,
} from '../src/adapters/text'
import { createGrokImage, grokImage } from '../src/adapters/image'
import { createGrokSummarize, grokSummarize } from '../src/adapters/summarize'
import {
  codeExecutionTool,
  fileSearchTool,
  mcpTool,
  webSearchTool,
  xSearchTool,
} from '../src/tools'
import type OpenAI from 'openai'
import type { StreamChunk, Tool } from '@tanstack/ai'
import type { GrokTextProviderOptions } from '../src/adapters/text'

// Test helper: a silent logger for test chatStream calls.
const testLogger = resolveDebugOption(false)

const weatherTool: Tool = {
  name: 'lookup_weather',
  description: 'Return the forecast for a location',
}

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

/**
 * Wires a fresh GrokTextAdapter with its internal OpenAI SDK `responses.create`
 * replaced by a vitest mock. Returns the mock so each test can configure
 * stream/non-stream behavior and assert on the request payload.
 */
function buildAdapter(model: 'grok-4.3' | 'grok-4.2' = 'grok-4.3') {
  const adapter = new GrokTextAdapter({ apiKey: 'test-api-key' }, model)
  const responsesCreate = vi.fn()
  const testAdapter = adapter as unknown as {
    client: Pick<OpenAI, 'responses'>
  }
  testAdapter.client = {
    responses: { create: responsesCreate },
  } as unknown as Pick<OpenAI, 'responses'>
  return { adapter, responsesCreate }
}

describe('Grok adapters - factory', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('Text adapter', () => {
    it('creates a text adapter with explicit API key', () => {
      const adapter = createGrokText('grok-4.3', 'test-api-key')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('text')
      expect(adapter.name).toBe('grok')
      expect(adapter.model).toBe('grok-4.3')
    })

    it('creates a text adapter from environment variable', () => {
      vi.stubEnv('XAI_API_KEY', 'env-api-key')

      const adapter = grokText('grok-4.3')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('text')
      expect(adapter.model).toBe('grok-4.3')
    })

    it('throws if XAI_API_KEY is not set when using grokText', () => {
      vi.stubEnv('XAI_API_KEY', '')

      expect(() => grokText('grok-4.3')).toThrow('XAI_API_KEY is required')
    })

    it('allows custom baseURL override', () => {
      const adapter = createGrokText('grok-4.3', 'test-api-key', {
        baseURL: 'https://custom.api.example.com/v1',
      })

      expect(adapter).toBeDefined()
    })
  })

  describe('Image adapter', () => {
    it('creates an image adapter with explicit API key', () => {
      const adapter = createGrokImage('grok-imagine-image', 'test-api-key')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('image')
      expect(adapter.name).toBe('grok')
      expect(adapter.model).toBe('grok-imagine-image')
    })

    it('creates an image adapter from environment variable', () => {
      vi.stubEnv('XAI_API_KEY', 'env-api-key')

      const adapter = grokImage('grok-imagine-image')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('image')
    })

    it('throws if XAI_API_KEY is not set when using grokImage', () => {
      vi.stubEnv('XAI_API_KEY', '')

      expect(() => grokImage('grok-imagine-image')).toThrow(
        'XAI_API_KEY is required',
      )
    })
  })

  describe('Summarize adapter', () => {
    it('creates a summarize adapter with explicit API key', () => {
      const adapter = createGrokSummarize('grok-4.3', 'test-api-key')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('summarize')
      expect(adapter.name).toBe('grok')
      expect(adapter.model).toBe('grok-4.3')
    })

    it('creates a summarize adapter from environment variable', () => {
      vi.stubEnv('XAI_API_KEY', 'env-api-key')

      const adapter = grokSummarize('grok-4.3')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('summarize')
    })

    it('throws if XAI_API_KEY is not set when using grokSummarize', () => {
      vi.stubEnv('XAI_API_KEY', '')

      expect(() => grokSummarize('grok-4.3')).toThrow('XAI_API_KEY is required')
    })
  })
})

describe('Grok text adapter - Responses API request body', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('targets responses.create (not chat.completions.create) with Responses-API params', async () => {
    const { adapter, responsesCreate } = buildAdapter()
    responsesCreate.mockResolvedValue(
      createAsyncIterable([
        {
          type: 'response.created',
          response: { id: 'resp-1', model: 'grok-4.3' },
        },
        {
          type: 'response.completed',
          response: {
            id: 'resp-1',
            model: 'grok-4.3',
            output: [],
            usage: { input_tokens: 5, output_tokens: 1, total_tokens: 6 },
          },
        },
      ]),
    )

    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter.chatStream({
      model: 'grok-4.3',
      messages: [{ role: 'user', content: 'Hello' }],
      systemPrompts: ['Stay concise'],
      maxTokens: 256,
      temperature: 0.7,
      topP: 0.9,
      logger: testLogger,
    })) {
      chunks.push(chunk)
    }

    expect(responsesCreate).toHaveBeenCalledTimes(1)
    const [payload] = responsesCreate.mock.calls[0]

    expect(payload).toMatchObject({
      model: 'grok-4.3',
      temperature: 0.7,
      top_p: 0.9,
      max_output_tokens: 256,
      instructions: 'Stay concise',
      stream: true,
    })

    // Messages must be converted to Responses-API ResponseInput shape.
    expect(payload.input).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Hello' }],
      },
    ])
  })

  it('enables encrypted reasoning round-trip by default (store=false, include=["reasoning.encrypted_content"])', async () => {
    const { adapter, responsesCreate } = buildAdapter()
    responsesCreate.mockResolvedValue(
      createAsyncIterable([
        {
          type: 'response.completed',
          response: {
            id: 'resp-1',
            model: 'grok-4.3',
            output: [],
            usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
          },
        },
      ]),
    )

    for await (const _ of adapter.chatStream({
      model: 'grok-4.3',
      messages: [{ role: 'user', content: 'Hi' }],
      logger: testLogger,
    })) {
      // drain
    }

    const [payload] = responsesCreate.mock.calls[0]
    expect(payload.store).toBe(false)
    expect(payload.include).toEqual(['reasoning.encrypted_content'])
  })

  it('honors caller-provided store and include over the encrypted-reasoning defaults', async () => {
    const { adapter, responsesCreate } = buildAdapter()
    responsesCreate.mockResolvedValue(
      createAsyncIterable([
        {
          type: 'response.completed',
          response: {
            id: 'resp-1',
            model: 'grok-4.3',
            output: [],
            usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
          },
        },
      ]),
    )

    for await (const _ of adapter.chatStream({
      model: 'grok-4.3',
      messages: [{ role: 'user', content: 'Hi' }],
      modelOptions: { store: true, include: [] },
      logger: testLogger,
    })) {
      // drain
    }

    const [payload] = responsesCreate.mock.calls[0]
    expect(payload.store).toBe(true)
    expect(payload.include).toEqual([])
  })

  it.each(['grok-4.3', 'grok-4.2'] as const)(
    'fails early when reasoning.effort is used with %s',
    async (model) => {
      const { adapter, responsesCreate } = buildAdapter(model)

      await expect(async () => {
        for await (const _ of adapter.chatStream({
          model,
          messages: [{ role: 'user', content: 'Reason please' }],
          modelOptions: {
            reasoning: { effort: 'low' },
          } as GrokTextProviderOptions,
          logger: testLogger,
        })) {
          // drain
        }
      }).rejects.toThrow(new RegExp(`${model} does not support .*reasoning\\.effort`))

      expect(responsesCreate).not.toHaveBeenCalled()
    },
  )

  it('emits Responses-API function tools (flat shape, strict)', async () => {
    const { adapter, responsesCreate } = buildAdapter()
    responsesCreate.mockResolvedValue(
      createAsyncIterable([
        {
          type: 'response.completed',
          response: {
            id: 'resp-1',
            model: 'grok-4.3',
            output: [],
            usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
          },
        },
      ]),
    )

    for await (const _ of adapter.chatStream({
      model: 'grok-4.3',
      messages: [{ role: 'user', content: 'Weather?' }],
      tools: [weatherTool],
      logger: testLogger,
    })) {
      // drain
    }

    const [payload] = responsesCreate.mock.calls[0]
    expect(payload.tools).toBeDefined()
    expect(payload.tools[0]).toMatchObject({
      type: 'function',
      name: 'lookup_weather',
      description: 'Return the forecast for a location',
      strict: true,
    })
    // Critically: NOT the Chat-Completions nested `function` wrapper.
    expect(payload.tools[0].function).toBeUndefined()
  })

  it('emits xAI server-side tools in provider-native Responses API shape', async () => {
    const { adapter, responsesCreate } = buildAdapter()
    responsesCreate.mockResolvedValue(
      createAsyncIterable([
        {
          type: 'response.completed',
          response: {
            id: 'resp-1',
            model: 'grok-4.3',
            output: [],
            usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
          },
        },
      ]),
    )

    for await (const _ of adapter.chatStream({
      model: 'grok-4.3',
      messages: [{ role: 'user', content: 'Search and run code' }],
      tools: [
        webSearchTool(),
        xSearchTool({
          allowed_x_handles: ['xai'],
          enable_image_understanding: true,
        }),
        codeExecutionTool(),
        fileSearchTool({ type: 'file_search', vector_store_ids: ['vs_test'] }),
        mcpTool({ server_url: 'https://example.com/mcp', server_label: 'example' }),
      ],
      logger: testLogger,
    })) {
      // drain
    }

    const [payload] = responsesCreate.mock.calls[0]
    expect(payload.tools).toEqual([
      { type: 'web_search' },
      {
        type: 'x_search',
        allowed_x_handles: ['xai'],
        enable_image_understanding: true,
      },
      { type: 'code_execution' },
      {
        type: 'file_search',
        vector_store_ids: ['vs_test'],
        max_num_results: undefined,
        ranking_options: undefined,
        filters: undefined,
      },
      {
        type: 'mcp',
        server_url: 'https://example.com/mcp',
        server_label: 'example',
      },
    ])
  })
})

describe('Grok text adapter - AG-UI event emission (Responses API stream)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('emits RUN_STARTED then TEXT_MESSAGE_START/CONTENT/END then RUN_FINISHED', async () => {
    const { adapter, responsesCreate } = buildAdapter()
    responsesCreate.mockResolvedValue(
      createAsyncIterable([
        {
          type: 'response.created',
          response: { id: 'resp-1', model: 'grok-4.3' },
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
          type: 'response.completed',
          response: {
            id: 'resp-1',
            model: 'grok-4.3',
            output: [],
            usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
          },
        },
      ]),
    )

    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter.chatStream({
      model: 'grok-4.3',
      messages: [{ role: 'user', content: 'Say hi' }],
      logger: testLogger,
    })) {
      chunks.push(chunk)
    }

    const types = chunks.map((c) => c.type as string)

    expect(types[0]).toBe('RUN_STARTED')

    const startIdx = types.indexOf('TEXT_MESSAGE_START')
    const firstContentIdx = types.indexOf('TEXT_MESSAGE_CONTENT')
    const endIdx = types.indexOf('TEXT_MESSAGE_END')
    const finishedIdx = types.indexOf('RUN_FINISHED')

    expect(startIdx).toBeGreaterThan(-1)
    expect(firstContentIdx).toBeGreaterThan(startIdx)
    expect(endIdx).toBeGreaterThan(firstContentIdx)
    expect(finishedIdx).toBeGreaterThan(endIdx)

    const contentChunks = chunks.filter(
      (c) => c.type === 'TEXT_MESSAGE_CONTENT',
    )
    expect(contentChunks).toHaveLength(2)
    if (contentChunks[1]?.type === 'TEXT_MESSAGE_CONTENT') {
      expect(contentChunks[1].content).toBe('Hello world')
    }

    const runFinished = chunks.find((c) => c.type === 'RUN_FINISHED')
    if (runFinished?.type === 'RUN_FINISHED') {
      expect(runFinished.finishReason).toBe('stop')
      expect(runFinished.usage).toMatchObject({
        promptTokens: 5,
        completionTokens: 2,
        totalTokens: 7,
      })
    }
  })

  it('emits REASONING_* events when the response stream contains reasoning_text deltas', async () => {
    const { adapter, responsesCreate } = buildAdapter()
    responsesCreate.mockResolvedValue(
      createAsyncIterable([
        {
          type: 'response.created',
          response: { id: 'resp-1', model: 'grok-4.3' },
        },
        {
          type: 'response.reasoning_text.delta',
          delta: 'Thinking carefully...',
        },
        {
          type: 'response.output_text.delta',
          delta: 'Answer',
        },
        {
          type: 'response.completed',
          response: {
            id: 'resp-1',
            model: 'grok-4.3',
            output: [],
            usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
          },
        },
      ]),
    )

    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter.chatStream({
      model: 'grok-4.3',
      messages: [{ role: 'user', content: 'Reason' }],
      logger: testLogger,
    })) {
      chunks.push(chunk)
    }

    const types = chunks.map((c) => c.type as string)
    expect(types).toContain('REASONING_START')
    expect(types).toContain('REASONING_MESSAGE_START')
    expect(types).toContain('REASONING_MESSAGE_CONTENT')
    // Reasoning must be closed before text starts.
    const reasoningEndIdx = types.indexOf('REASONING_END')
    const textStartIdx = types.indexOf('TEXT_MESSAGE_START')
    expect(reasoningEndIdx).toBeGreaterThan(-1)
    expect(textStartIdx).toBeGreaterThan(reasoningEndIdx)

    const reasoningContent = chunks.find(
      (c) => c.type === 'REASONING_MESSAGE_CONTENT',
    )
    if (reasoningContent?.type === 'REASONING_MESSAGE_CONTENT') {
      expect(reasoningContent.delta).toBe('Thinking carefully...')
    }
  })

  it('emits AG-UI tool call events from Responses-API function_call streaming', async () => {
    const { adapter, responsesCreate } = buildAdapter()
    responsesCreate.mockResolvedValue(
      createAsyncIterable([
        {
          type: 'response.created',
          response: { id: 'resp-1', model: 'grok-4.3' },
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
            id: 'resp-1',
            model: 'grok-4.3',
            output: [
              {
                type: 'function_call',
                id: 'call_abc123',
                name: 'lookup_weather',
                arguments: '{"location":"Berlin"}',
              },
            ],
            usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          },
        },
      ]),
    )

    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter.chatStream({
      model: 'grok-4.3',
      messages: [{ role: 'user', content: 'Weather in Berlin?' }],
      tools: [weatherTool],
      logger: testLogger,
    })) {
      chunks.push(chunk)
    }

    const start = chunks.find((c) => c.type === 'TOOL_CALL_START')
    expect(start).toBeDefined()
    if (start?.type === 'TOOL_CALL_START') {
      expect(start.toolCallId).toBe('call_abc123')
      expect(start.toolName).toBe('lookup_weather')
    }

    const argsChunks = chunks.filter((c) => c.type === 'TOOL_CALL_ARGS')
    expect(argsChunks.length).toBe(2)

    const end = chunks.find((c) => c.type === 'TOOL_CALL_END')
    expect(end).toBeDefined()
    if (end?.type === 'TOOL_CALL_END') {
      expect(end.toolCallId).toBe('call_abc123')
      expect(end.toolName).toBe('lookup_weather')
      expect(end.input).toEqual({ location: 'Berlin' })
    }

    const runFinished = chunks.find((c) => c.type === 'RUN_FINISHED')
    if (runFinished?.type === 'RUN_FINISHED') {
      expect(runFinished.finishReason).toBe('tool_calls')
    }
  })

  it('emits RUN_ERROR when the stream throws mid-flight', async () => {
    const { adapter, responsesCreate } = buildAdapter()
    const errorIterable = {
      [Symbol.asyncIterator]() {
        let yielded = false
        return {
          async next() {
            if (!yielded) {
              yielded = true
              return {
                value: {
                  type: 'response.created',
                  response: { id: 'resp-1', model: 'grok-4.3' },
                },
                done: false,
              }
            }
            throw new Error('Stream interrupted')
          },
        }
      },
    }
    responsesCreate.mockResolvedValue(errorIterable)

    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter.chatStream({
      model: 'grok-4.3',
      messages: [{ role: 'user', content: 'Hi' }],
      logger: testLogger,
    })) {
      chunks.push(chunk)
    }

    const runError = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(runError).toBeDefined()
    if (runError?.type === 'RUN_ERROR') {
      expect(runError.message).toBe('Stream interrupted')
    }
  })
})
