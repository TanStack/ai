import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { createOpenRouterText } from '../src/adapters/text'
import type { StreamChunk, Tool } from '@tanstack/ai'
import type { OpenRouterTextProviderOptions } from '../src/adapters/text'

const createAdapter = () =>
  createOpenRouterText('openai/gpt-4o-mini', 'test-key')

const toolArguments = JSON.stringify({ location: 'Berlin' })

const weatherTool: Tool = {
  name: 'lookup_weather',
  description: 'Return the forecast for a location',
}

function createMockSSEResponse(
  chunks: Array<Record<string, unknown>>,
): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        const data = `data: ${JSON.stringify(chunk)}\n\n`
        controller.enqueue(encoder.encode(data))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

describe('OpenRouter adapter option mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps options into the Chat Completions API payload', async () => {
    const mockResponse = createMockSSEResponse([
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: { content: 'It is sunny' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: {},
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 4,
          total_tokens: 16,
        },
      },
    ])

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    const modelOptions: OpenRouterTextProviderOptions = {
      tool_choice: 'auto',
      plugins: [{ id: 'web', max_results: 5 }],
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

    expect(fetchSpy).toHaveBeenCalledTimes(1)

    const call = fetchSpy.mock.calls[0]
    expect(call).toBeDefined()

    const [url, options] = call!
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')

    const payload = JSON.parse(options?.body as string)

    expect(payload).toMatchObject({
      model: 'openai/gpt-4o-mini',
      temperature: 0.25,
      top_p: 0.6,
      max_tokens: 1024,
      stream: true,
      tool_choice: 'auto',
      plugins: [{ id: 'web', max_results: 5 }],
    })

    expect(payload.messages).toBeDefined()
    expect(Array.isArray(payload.messages)).toBe(true)

    expect(payload.tools).toBeDefined()
    expect(Array.isArray(payload.tools)).toBe(true)
    expect(payload.tools.length).toBeGreaterThan(0)

    fetchSpy.mockRestore()
  })

  it('streams chat chunks with content and usage', async () => {
    const mockResponse = createMockSSEResponse([
      {
        id: 'chatcmpl-stream',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: { content: 'Hello ' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-stream',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: { content: 'world' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-stream',
        model: 'openai/gpt-4o-mini',
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
    ])

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse)

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

    fetchSpy.mockRestore()
  })

  it('handles tool calls in streaming response', async () => {
    const mockResponse = createMockSSEResponse([
      {
        id: 'chatcmpl-456',
        model: 'openai/gpt-4o-mini',
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
        model: 'openai/gpt-4o-mini',
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
        model: 'openai/gpt-4o-mini',
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
    ])

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse)

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
    expect(toolCallChunk.toolCall.function.name).toBe('lookup_weather')
    expect(toolCallChunk.toolCall.function.arguments).toBe(
      '{"location":"Berlin"}',
    )

    fetchSpy.mockRestore()
  })

  it('handles multimodal input with text and image', async () => {
    const mockResponse = createMockSSEResponse([
      {
        id: 'chatcmpl-multimodal',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: { content: 'I can see the image' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 5, total_tokens: 55 },
      },
    ])

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse)

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

    const [, options] = fetchSpy.mock.calls[0]!
    const payload = JSON.parse(options?.body as string)

    const contentParts = payload.messages[0].content
    expect(contentParts[0]).toMatchObject({
      type: 'text',
      text: 'What do you see?',
    })
    expect(contentParts[1]).toMatchObject({
      type: 'image_url',
      image_url: { url: 'https://example.com/image.jpg' },
    })

    fetchSpy.mockRestore()
  })

  it('yields error chunk on HTTP error response', async () => {
    const errorResponse = new Response(
      JSON.stringify({ error: { message: 'Invalid API key' } }),
      { status: 401 },
    )

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(errorResponse)

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
      expect(chunks[0].error.code).toBe('401')
    }

    fetchSpy.mockRestore()
  })
})
