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

    expect(chunks[0]).toMatchObject({
      type: 'content',
      delta: 'Hello ',
      content: 'Hello ',
    })

    expect(chunks[1]).toMatchObject({
      type: 'content',
      delta: 'world',
      content: 'Hello world',
    })

    const doneChunk = chunks.find(
      (c) => c.type === 'done' && 'usage' in c && c.usage,
    )
    expect(doneChunk).toMatchObject({
      type: 'done',
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
    for await (const chunk of chat({
      adapter,
      messages: [{ role: 'user', content: 'What is the weather in Berlin?' }],
      tools: [weatherTool],
    })) {
      chunks.push(chunk)
    }

    const toolCallChunks = chunks.filter((c) => c.type === 'tool_call')
    expect(toolCallChunks.length).toBe(1)

    const toolCallChunk = toolCallChunks[0]
    expect(toolCallChunk?.toolCall.function.name).toBe('lookup_weather')
    expect(toolCallChunk?.toolCall.function.arguments).toBe(
      '{"location":"Berlin"}',
    )
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

    expect(chunks.length).toBe(1)
    expect(chunks[0]!.type).toBe('error')

    if (chunks[0] && chunks[0].type === 'error') {
      expect(chunks[0].error.message).toBe('Invalid API key')
    }
  })
})
