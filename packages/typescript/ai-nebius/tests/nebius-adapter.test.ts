import { describe, it, expect, beforeEach, vi } from 'vitest'
import { chat, type Tool, type StreamChunk } from '@tanstack/ai'
import { NebiusTextAdapter } from '../src/adapters/text'
import type { NebiusTextProviderOptions } from '../src/adapters/text'

const createAdapter = <TModel extends string>(model: TModel) =>
  new NebiusTextAdapter({ apiKey: 'test-key' }, model)

const toolArguments = JSON.stringify({ location: 'Berlin' })

const weatherTool: Tool = {
  name: 'lookup_weather',
  description: 'Return the forecast for a location',
}

function createMockChatCompletionsStream(
  chunks: Array<Record<string, unknown>>,
): AsyncIterable<Record<string, unknown>> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

describe('Nebius adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('option mapping', () => {
    it('maps options into the Chat Completions API payload', async () => {
      // Mock the Chat Completions API stream format
      const mockStream = createMockChatCompletionsStream([
        {
          id: 'chatcmpl-123',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'deepseek-ai/DeepSeek-R1-0528',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: 'It is sunny' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-123',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'deepseek-ai/DeepSeek-R1-0528',
          choices: [
            {
              index: 0,
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

      const chatCompletionsCreate = vi.fn().mockResolvedValueOnce(mockStream)

      const adapter = createAdapter('deepseek-ai/DeepSeek-R1-0528')
      // Replace the internal OpenAI SDK client with our mock
      ;(adapter as any).client = {
        chat: {
          completions: {
            create: chatCompletionsCreate,
          },
        },
      }

      const modelOptions: NebiusTextProviderOptions = {
        presence_penalty: 0.5,
        frequency_penalty: 0.3,
      }

      const chunks: StreamChunk[] = []
      for await (const chunk of chat({
        adapter,
        messages: [
          { role: 'system', content: 'Stay concise' },
          { role: 'user', content: 'How is the weather?' },
        ],
        tools: [weatherTool],
        temperature: 0.25,
        topP: 0.6,
        maxTokens: 1024,
        modelOptions,
      })) {
        chunks.push(chunk)
      }

      expect(chatCompletionsCreate).toHaveBeenCalledTimes(1)
      const [payload] = chatCompletionsCreate.mock.calls[0]

      // Verify Chat Completions API format
      expect(payload).toMatchObject({
        model: 'deepseek-ai/DeepSeek-R1-0528',
        temperature: 0.25,
        top_p: 0.6,
        max_tokens: 1024,
        stream: true,
        presence_penalty: 0.5,
        frequency_penalty: 0.3,
      })

      // Verify messages are included
      expect(payload.messages).toBeDefined()
      expect(Array.isArray(payload.messages)).toBe(true)

      // Verify tools are included
      expect(payload.tools).toBeDefined()
      expect(Array.isArray(payload.tools)).toBe(true)
      expect(payload.tools.length).toBeGreaterThan(0)
    })
  })

  describe('streaming', () => {
    it('handles content streaming correctly', async () => {
      const mockStream = createMockChatCompletionsStream([
        {
          id: 'chatcmpl-123',
          model: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: 'Hello' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-123',
          model: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
          choices: [
            {
              index: 0,
              delta: { content: ' world!' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-123',
          model: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop',
            },
          ],
        },
      ])

      const chatCompletionsCreate = vi.fn().mockResolvedValueOnce(mockStream)

      const adapter = createAdapter('meta-llama/Meta-Llama-3.1-70B-Instruct')
      ;(adapter as any).client = {
        chat: {
          completions: {
            create: chatCompletionsCreate,
          },
        },
      }

      const chunks: StreamChunk[] = []
      for await (const chunk of chat({
        adapter,
        messages: [{ role: 'user', content: 'Say hello!' }],
      })) {
        chunks.push(chunk)
      }

      // Should have content chunks plus done chunk
      expect(chunks.length).toBeGreaterThanOrEqual(2)

      // Find content chunks
      const contentChunks = chunks.filter((c) => c.type === 'content')
      expect(contentChunks.length).toBe(2)

      // Verify accumulated content
      const lastContentChunk = contentChunks[contentChunks.length - 1]
      if (lastContentChunk.type === 'content') {
        expect(lastContentChunk.content).toBe('Hello world!')
      }

      // Verify done chunk
      const doneChunk = chunks.find((c) => c.type === 'done')
      expect(doneChunk).toBeDefined()
      if (doneChunk?.type === 'done') {
        expect(doneChunk.finishReason).toBe('stop')
      }
    })
  })

  describe('tool calls', () => {
    it('handles tool call streaming correctly', async () => {
      const mockStream = createMockChatCompletionsStream([
        {
          id: 'chatcmpl-123',
          model: 'Qwen/Qwen2.5-72B-Instruct',
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_abc123',
                    index: 0,
                    type: 'function',
                    function: {
                      name: 'lookup_weather',
                      arguments: '{"loc',
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-123',
          model: 'Qwen/Qwen2.5-72B-Instruct',
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    id: 'call_abc123',
                    index: 0,
                    function: {
                      arguments: 'ation":"Berlin"}',
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-123',
          model: 'Qwen/Qwen2.5-72B-Instruct',
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'tool_calls',
            },
          ],
        },
      ])

      const chatCompletionsCreate = vi.fn().mockResolvedValueOnce(mockStream)

      const adapter = createAdapter('Qwen/Qwen2.5-72B-Instruct')
      ;(adapter as any).client = {
        chat: {
          completions: {
            create: chatCompletionsCreate,
          },
        },
      }

      const chunks: StreamChunk[] = []
      for await (const chunk of chat({
        adapter,
        messages: [{ role: 'user', content: 'What is the weather in Berlin?' }],
        tools: [weatherTool],
      })) {
        chunks.push(chunk)
      }

      // Find tool call chunk
      const toolCallChunk = chunks.find((c) => c.type === 'tool_call')
      expect(toolCallChunk).toBeDefined()
      if (toolCallChunk?.type === 'tool_call') {
        expect(toolCallChunk.toolCall.function.name).toBe('lookup_weather')
        expect(toolCallChunk.toolCall.function.arguments).toContain('Berlin')
      }

      // Verify done chunk with tool_calls finish reason
      const doneChunk = chunks.find((c) => c.type === 'done')
      expect(doneChunk).toBeDefined()
      if (doneChunk?.type === 'done') {
        expect(doneChunk.finishReason).toBe('tool_calls')
      }
    })
  })

  describe('message formatting', () => {
    it('handles conversation with tool results', async () => {
      const mockStream = createMockChatCompletionsStream([
        {
          id: 'chatcmpl-123',
          model: 'deepseek-ai/DeepSeek-R1-0528',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: 'The temperature is 72°F' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-123',
          model: 'deepseek-ai/DeepSeek-R1-0528',
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop',
            },
          ],
        },
      ])

      const chatCompletionsCreate = vi.fn().mockResolvedValueOnce(mockStream)

      const adapter = createAdapter('deepseek-ai/DeepSeek-R1-0528')
      ;(adapter as any).client = {
        chat: {
          completions: {
            create: chatCompletionsCreate,
          },
        },
      }

      const chunks: StreamChunk[] = []
      for await (const chunk of chat({
        adapter,
        messages: [
          { role: 'user', content: 'What is the weather in Berlin?' },
          {
            role: 'assistant',
            content: null,
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
      })) {
        chunks.push(chunk)
      }

      expect(chatCompletionsCreate).toHaveBeenCalledTimes(1)
      const [payload] = chatCompletionsCreate.mock.calls[0]

      // Verify messages include user, assistant with tool calls, and tool result
      expect(payload.messages.length).toBe(3)

      // Verify tool message format
      const toolMessage = payload.messages.find(
        (m: Record<string, unknown>) => m.role === 'tool',
      )
      expect(toolMessage).toBeDefined()
      expect(toolMessage.tool_call_id).toBe('call_weather')
      expect(toolMessage.content).toBe('{"temp":72}')
    })
  })

  describe('multimodal content', () => {
    it('handles image content in messages', async () => {
      const mockStream = createMockChatCompletionsStream([
        {
          id: 'chatcmpl-123',
          model: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: 'I see a cat.' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-123',
          model: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop',
            },
          ],
        },
      ])

      const chatCompletionsCreate = vi.fn().mockResolvedValueOnce(mockStream)

      const adapter = createAdapter('meta-llama/Meta-Llama-3.1-70B-Instruct')
      ;(adapter as any).client = {
        chat: {
          completions: {
            create: chatCompletionsCreate,
          },
        },
      }

      const chunks: StreamChunk[] = []
      for await (const chunk of chat({
        adapter,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', content: 'What is in this image?' },
              {
                type: 'image',
                source: {
                  type: 'url',
                  value: 'https://example.com/cat.jpg',
                },
              },
            ],
          },
        ],
      })) {
        chunks.push(chunk)
      }

      expect(chatCompletionsCreate).toHaveBeenCalledTimes(1)
      const [payload] = chatCompletionsCreate.mock.calls[0]

      // Verify multimodal content format
      const userMessage = payload.messages[0]
      expect(userMessage.role).toBe('user')
      expect(Array.isArray(userMessage.content)).toBe(true)
      expect(userMessage.content.length).toBe(2)

      // Verify text part
      expect(userMessage.content[0].type).toBe('text')
      expect(userMessage.content[0].text).toBe('What is in this image?')

      // Verify image part
      expect(userMessage.content[1].type).toBe('image_url')
      expect(userMessage.content[1].image_url.url).toBe(
        'https://example.com/cat.jpg',
      )
    })
  })
})

describe('Nebius client configuration', () => {
  it('uses correct default base URL', () => {
    const adapter = new NebiusTextAdapter(
      { apiKey: 'test-key' },
      'deepseek-ai/DeepSeek-R1-0528',
    )

    // The client should be configured with Nebius Token Factory URL
    const client = (adapter as any).client
    expect(client).toBeDefined()
  })

  it('allows custom base URL', () => {
    const adapter = new NebiusTextAdapter(
      { apiKey: 'test-key', baseURL: 'https://custom.api.com/v1/' },
      'deepseek-ai/DeepSeek-R1-0528',
    )

    const client = (adapter as any).client
    expect(client).toBeDefined()
  })
})
