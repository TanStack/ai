import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ai, type Tool, type StreamChunk } from '@tanstack/ai'
import { GrokTextAdapter } from '../src/adapters/text'

const createAdapter = () => new GrokTextAdapter({ apiKey: 'test-key' })

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

describe('Grok adapter option mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps options into the Chat Completions API payload', async () => {
    // Mock the Chat Completions API stream format
    const mockStream = createMockChatCompletionsStream([
      {
        id: 'chatcmpl-123',
        model: 'grok-3',
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
              content: 'It is sunny',
            },
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        model: 'grok-3',
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

    const adapter = createAdapter()
    // Replace the internal OpenAI SDK client with our mock
    ;(adapter as any).client = {
      chat: {
        completions: {
          create: chatCompletionsCreate,
        },
      },
    }

    const chunks: StreamChunk[] = []
    for await (const chunk of ai({
      adapter,
      model: 'grok-3',
      messages: [
        { role: 'system', content: 'Stay concise' },
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
      options: {
        temperature: 0.25,
        topP: 0.6,
        maxTokens: 1024,
      },
    })) {
      chunks.push(chunk)
    }

    expect(chatCompletionsCreate).toHaveBeenCalledTimes(1)
    const [payload] = chatCompletionsCreate.mock.calls[0]

    // Chat Completions API format
    expect(payload).toMatchObject({
      model: 'grok-3',
      temperature: 0.25,
      top_p: 0.6,
      max_tokens: 1024,
      stream: true,
    })

    // Chat Completions API uses 'messages' array
    expect(payload.messages).toBeDefined()
    expect(Array.isArray(payload.messages)).toBe(true)

    // Verify tools are included
    expect(payload.tools).toBeDefined()
    expect(Array.isArray(payload.tools)).toBe(true)
    expect(payload.tools.length).toBeGreaterThan(0)
  })

  it('handles tool calls in streaming response', async () => {
    // Mock the Chat Completions API stream with tool calls
    const mockStream = createMockChatCompletionsStream([
      {
        id: 'chatcmpl-123',
        model: 'grok-3',
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  index: 0,
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'lookup_weather',
                    arguments: '',
                  },
                },
              ],
            },
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        model: 'grok-3',
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: {
                    arguments: '{"location": "Berlin"}',
                  },
                },
              ],
            },
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        model: 'grok-3',
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 8,
          total_tokens: 20,
        },
      },
    ])

    const chatCompletionsCreate = vi.fn().mockResolvedValueOnce(mockStream)

    const adapter = createAdapter()
    ;(adapter as any).client = {
      chat: {
        completions: {
          create: chatCompletionsCreate,
        },
      },
    }

    const chunks: StreamChunk[] = []
    for await (const chunk of ai({
      adapter,
      model: 'grok-3',
      messages: [{ role: 'user', content: 'How is the weather in Berlin?' }],
      tools: [weatherTool],
    })) {
      chunks.push(chunk)
    }

    // Verify we got a tool_call chunk
    const toolCallChunks = chunks.filter((c) => c.type === 'tool_call')
    expect(toolCallChunks.length).toBeGreaterThan(0)

    // Verify done chunk has tool_calls finish reason
    const doneChunk = chunks.find((c) => c.type === 'done')
    expect(doneChunk).toBeDefined()
    if (doneChunk && doneChunk.type === 'done') {
      expect(doneChunk.finishReason).toBe('tool_calls')
    }
  })
})
