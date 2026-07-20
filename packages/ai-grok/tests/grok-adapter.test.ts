import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { EventType, summarize } from '@tanstack/ai'
import { createGrokText, grokText } from '../src/adapters/text'
import { createGrokImage, grokImage } from '../src/adapters/image'
import { createGrokSummarize, grokSummarize } from '../src/adapters/summarize'
import { GROK_CHAT_MODELS } from '../src/model-meta'
import {
  grokFileSearchTool,
  grokMCPTool,
  grokWebSearchTool,
  grokXSearchTool,
} from '../src/tools'
import type { StreamChunk, Tool } from '@tanstack/ai'

const testLogger = resolveDebugOption(false)

vi.mock('openai', () => {
  return {
    default: class {
      responses = {
        create: vi.fn(),
      }
      images = {
        generate: vi.fn(),
      }
    },
  }
})

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

function injectMockResponsesClient(
  adapter: object,
  streamChunks: Array<Record<string, unknown>>,
  nonStreamResponse?: Record<string, unknown>,
): ReturnType<typeof vi.fn> {
  const mockCreate = vi.fn().mockImplementation((params) => {
    if (params.stream) {
      return Promise.resolve(createAsyncIterable(streamChunks))
    }
    return Promise.resolve(nonStreamResponse)
  })
  ;(adapter as any).client = {
    responses: {
      create: mockCreate,
    },
  }
  return mockCreate
}

async function consume(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _chunk of stream) {
    // Exhaust the stream so the adapter sends the request and processes events.
  }
}

const responseCreated = {
  type: 'response.created',
  response: { id: 'resp_123', model: 'grok-4.3' },
}

const responseCompleted = {
  type: 'response.completed',
  response: {
    id: 'resp_123',
    model: 'grok-4.3',
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Hello world' }],
      },
    ],
    usage: {
      input_tokens: 1,
      output_tokens: 2,
      total_tokens: 3,
    },
  },
}

const weatherTool: Tool = {
  name: 'lookup_weather',
  description: 'Return the forecast for a location',
}

describe('Grok adapters', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('exposes only the supported xAI Responses chat models', () => {
    expect(GROK_CHAT_MODELS).toEqual(['grok-build-0.1', 'grok-4.3'])
  })

  describe('Text adapter', () => {
    it('creates a text adapter with explicit API key', () => {
      const adapter = createGrokText('grok-build-0.1', 'test-api-key')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('text')
      expect(adapter.name).toBe('grok')
      expect(adapter.model).toBe('grok-build-0.1')
    })

    it('creates a text adapter from environment variable', () => {
      vi.stubEnv('XAI_API_KEY', 'env-api-key')

      const adapter = grokText('grok-build-0.1')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('text')
      expect(adapter.model).toBe('grok-build-0.1')
    })

    it('throws if XAI_API_KEY is not set when using grokText', () => {
      vi.stubEnv('XAI_API_KEY', '')

      expect(() => grokText('grok-build-0.1')).toThrow(
        'XAI_API_KEY is required',
      )
    })

    it('uses Responses API defaults and model option wire names', async () => {
      const adapter = createGrokText('grok-build-0.1', 'test-api-key')
      const mockCreate = injectMockResponsesClient(adapter, [
        responseCreated,
        { type: 'response.output_text.delta', delta: 'Hello world' },
        responseCompleted,
      ])

      const modelOptions = {
        temperature: 0.5,
        top_p: 0.8,
        max_output_tokens: 128,
      }

      const chunks: Array<StreamChunk> = []
      for await (const chunk of adapter.chatStream({
        model: 'grok-build-0.1',
        messages: [{ role: 'user', content: 'Hello' }],
        modelOptions,
        logger: testLogger,
      })) {
        chunks.push(chunk)
      }

      expect(mockCreate).toHaveBeenCalledTimes(1)
      expect(mockCreate.mock.calls[0]?.[0]).toMatchObject({
        model: 'grok-build-0.1',
        stream: true,
        store: false,
        include: ['reasoning.encrypted_content'],
        temperature: 0.5,
        top_p: 0.8,
        max_output_tokens: 128,
      })
      expect(mockCreate.mock.calls[0]?.[0]).toHaveProperty('input')
      expect(
        chunks.some((chunk) => chunk.type === EventType.RUN_FINISHED),
      ).toBe(true)
    })

    it('lets callers override xAI Responses reasoning persistence defaults', async () => {
      const adapter = createGrokText('grok-build-0.1', 'test-api-key')
      const mockCreate = injectMockResponsesClient(adapter, [
        responseCreated,
        { type: 'response.output_text.delta', delta: 'Hello world' },
        responseCompleted,
      ])

      await consume(
        adapter.chatStream({
          model: 'grok-build-0.1',
          messages: [{ role: 'user', content: 'Hello' }],
          modelOptions: {
            store: true,
            include: [],
          },
          logger: testLogger,
        }),
      )

      expect(mockCreate.mock.calls[0]?.[0]).toMatchObject({
        store: true,
        include: [],
      })
    })

    it('rejects reasoning options locally for grok-build-0.1', async () => {
      const adapter = createGrokText('grok-build-0.1', 'test-api-key')
      const mockCreate = injectMockResponsesClient(adapter, [])

      const chunks: Array<StreamChunk> = []
      for await (const chunk of adapter.chatStream({
        model: 'grok-build-0.1',
        messages: [{ role: 'user', content: 'Hello' }],
        modelOptions: {
          reasoning: { effort: 'high' },
        } as any,
        logger: testLogger,
      })) {
        chunks.push(chunk)
      }

      expect(mockCreate).not.toHaveBeenCalled()
      expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
        true,
      )
      expect(
        chunks.find((chunk) => chunk.type === EventType.RUN_ERROR),
      ).toMatchObject({
        message:
          'grok-build-0.1 does not support reasoning modelOptions; omit reasoning for this model.',
      })
    })

    it('converts function tools to Responses API tools', async () => {
      const adapter = createGrokText('grok-build-0.1', 'test-api-key')
      const mockCreate = injectMockResponsesClient(adapter, [
        responseCreated,
        responseCompleted,
      ])

      await consume(
        adapter.chatStream({
          model: 'grok-build-0.1',
          messages: [{ role: 'user', content: 'What is the weather?' }],
          tools: [weatherTool],
          logger: testLogger,
        }),
      )

      expect(mockCreate.mock.calls[0]?.[0]).toMatchObject({
        tools: [
          {
            type: 'function',
            name: 'lookup_weather',
            description: 'Return the forecast for a location',
          },
        ],
      })
    })

    it('passes xAI server-side Responses tools through unchanged', async () => {
      const adapter = createGrokText('grok-build-0.1', 'test-api-key')
      const mockCreate = injectMockResponsesClient(adapter, [
        responseCreated,
        responseCompleted,
      ])

      await consume(
        adapter.chatStream({
          model: 'grok-build-0.1',
          messages: [{ role: 'user', content: 'Use server tools' }],
          tools: [
            grokWebSearchTool({
              filters: { allowed_domains: ['x.ai'] },
            }),
            grokXSearchTool({
              allowed_x_handles: ['xai'],
              from_date: '2026-01-01',
            }),
            grokFileSearchTool({
              vector_store_ids: ['collection_123'],
              max_num_results: 3,
            }),
            grokMCPTool({
              server_label: 'deepwiki',
              server_url: 'https://mcp.deepwiki.com/mcp',
              allowed_tools: ['ask_question'],
              authorization: 'Bearer mcp-test-token',
              headers: { 'X-Test-MCP': 'true' },
            }),
          ],
          logger: testLogger,
        }),
      )

      expect(mockCreate.mock.calls[0]?.[0]).toMatchObject({
        tools: [
          {
            type: 'web_search',
            filters: { allowed_domains: ['x.ai'] },
          },
          {
            type: 'x_search',
            allowed_x_handles: ['xai'],
            from_date: '2026-01-01',
          },
          {
            type: 'file_search',
            vector_store_ids: ['collection_123'],
            max_num_results: 3,
          },
          {
            type: 'mcp',
            server_label: 'deepwiki',
            server_url: 'https://mcp.deepwiki.com/mcp',
            allowed_tools: ['ask_question'],
            authorization: 'Bearer mcp-test-token',
            headers: { 'X-Test-MCP': 'true' },
          },
        ],
      })
    })

    it('keeps same-named user tools as function tools', async () => {
      const adapter = createGrokText('grok-build-0.1', 'test-api-key')
      const mockCreate = injectMockResponsesClient(adapter, [
        responseCreated,
        responseCompleted,
      ])

      await consume(
        adapter.chatStream({
          model: 'grok-build-0.1',
          messages: [
            { role: 'user', content: 'Call my local web_search tool' },
          ],
          tools: [
            {
              name: 'web_search',
              description: 'Local app search function, not xAI web search.',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                },
                required: ['query'],
                additionalProperties: false,
              },
            },
          ],
          logger: testLogger,
        }),
      )

      expect(mockCreate.mock.calls[0]?.[0]).toMatchObject({
        tools: [
          {
            type: 'function',
            name: 'web_search',
            description: 'Local app search function, not xAI web search.',
          },
        ],
      })
    })

    it('validates xAI server-side tool factories', () => {
      expect(() =>
        grokWebSearchTool({
          filters: {
            allowed_domains: ['x.ai'],
            excluded_domains: ['example.com'],
          },
        }),
      ).toThrow('allowed_domains and excluded_domains cannot both be provided.')
      expect(() =>
        grokWebSearchTool({
          filters: {
            allowed_domains: [
              'a.example',
              'b.example',
              'c.example',
              'd.example',
              'e.example',
              'f.example',
            ],
          },
        }),
      ).toThrow('allowed_domains supports at most 5 domains.')
      expect(() =>
        grokXSearchTool({
          allowed_x_handles: ['xai'],
          excluded_x_handles: ['elonmusk'],
        }),
      ).toThrow(
        'allowed_x_handles and excluded_x_handles cannot both be provided.',
      )
      expect(() =>
        grokXSearchTool({
          allowed_x_handles: Array.from(
            { length: 21 },
            (_, index) => `handle${index}`,
          ),
        }),
      ).toThrow('allowed_x_handles supports at most 20 handles.')
      expect(() =>
        grokFileSearchTool({
          vector_store_ids: [],
        }),
      ).toThrow('vector_store_ids must contain at least one collection id.')
      expect(() =>
        grokFileSearchTool({
          vector_store_ids: ['collection_123'],
          max_num_results: 0,
        }),
      ).toThrow('max_num_results must be between 1 and 50.')
      expect(() =>
        grokMCPTool({
          server_label: 'bad',
        } as any),
      ).toThrow('server_url must be provided.')
    })
  })

  describe('Image adapter', () => {
    it('creates an image adapter with explicit API key', () => {
      const adapter = createGrokImage('grok-2-image-1212', 'test-api-key')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('image')
      expect(adapter.name).toBe('grok')
      expect(adapter.model).toBe('grok-2-image-1212')
    })

    it('creates an image adapter from environment variable', () => {
      vi.stubEnv('XAI_API_KEY', 'env-api-key')

      const adapter = grokImage('grok-2-image-1212')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('image')
    })

    it('throws if XAI_API_KEY is not set when using grokImage', () => {
      vi.stubEnv('XAI_API_KEY', '')

      expect(() => grokImage('grok-2-image-1212')).toThrow(
        'XAI_API_KEY is required',
      )
    })

    it('maps the size template to aspect_ratio/resolution for imagine models', async () => {
      const adapter = createGrokImage('grok-imagine-image', 'test-api-key')
      const mockGenerate = vi.fn().mockResolvedValue({
        data: [{ url: 'https://example.com/out.png' }],
      })
      ;(adapter as any).client = { images: { generate: mockGenerate } }

      await adapter.generateImages({
        model: 'grok-imagine-image',
        prompt: 'A skyline',
        size: '16:9_2k',
        logger: testLogger,
      })

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'grok-imagine-image',
          aspect_ratio: '16:9',
          resolution: '2k',
        }),
      )
      expect(mockGenerate.mock.calls[0]![0]).not.toHaveProperty('size')
    })
  })

  describe('Summarize adapter', () => {
    it('creates a summarize adapter with explicit API key', () => {
      const adapter = createGrokSummarize('grok-build-0.1', 'test-api-key')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('summarize')
      expect(adapter.name).toBe('grok')
      expect(adapter.model).toBe('grok-build-0.1')
    })

    it('creates a summarize adapter from environment variable', () => {
      vi.stubEnv('XAI_API_KEY', 'env-api-key')

      const adapter = grokSummarize('grok-build-0.1')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('summarize')
    })

    it('throws if XAI_API_KEY is not set when using grokSummarize', () => {
      vi.stubEnv('XAI_API_KEY', '')

      expect(() => grokSummarize('grok-build-0.1')).toThrow(
        'XAI_API_KEY is required',
      )
    })

    it('grokSummarize is assignable to summarize() adapter param for every model (#821)', () => {
      // Type-level regression guard: the SummarizeAdapter constraint only
      // instantiates at the summarize() call site, so constructing the adapter
      // (covered above) is not enough. This closure is type-checked but never
      // executed — passing CI's test:types is the assertion.
      const _typeCheck = () => {
        void summarize({ adapter: grokSummarize('grok-4.3'), text: '' })
        void summarize({ adapter: grokSummarize('grok-build-0.1'), text: '' })
      }

      expect(_typeCheck).toBeInstanceOf(Function)
    })
  })
})
