import { describe, it, expect, beforeEach, vi } from 'vitest'
import { chat, type Tool, type StreamChunk } from '@tanstack/ai'
import { OpenAI, type OpenAIProviderOptions } from '../src/openai-adapter'

const createAdapter = () => new OpenAI({ apiKey: 'test-key' })

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

describe('OpenAI adapter option mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps options into the Responses API payload', async () => {
    // Mock the Responses API event stream format
    const mockStream = createMockChatCompletionsStream([
      {
        type: 'response.created',
        response: {
          id: 'resp-123',
          model: 'gpt-4o-mini',
          status: 'in_progress',
          created_at: 1234567890,
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
        type: 'response.done',
        response: {
          id: 'resp-123',
          model: 'gpt-4o-mini',
          status: 'completed',
          created_at: 1234567891,
          usage: {
            input_tokens: 12,
            output_tokens: 4,
          },
        },
      },
    ])

    const responsesCreate = vi.fn().mockResolvedValueOnce(mockStream)

    const adapter = createAdapter()
    // Replace the internal OpenAI SDK client with our mock
    ;(adapter as any).client = {
      responses: {
        create: responsesCreate,
      },
    }

    const providerOptions: OpenAIProviderOptions = {
      tool_choice: 'required',
    }

    const chunks: StreamChunk[] = []
    for await (const chunk of chat({
      adapter,
      model: 'gpt-4o-mini',
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
        metadata: { requestId: 'req-42' },
      },
      providerOptions,
    })) {
      chunks.push(chunk)
    }

    expect(responsesCreate).toHaveBeenCalledTimes(1)
    const [payload] = responsesCreate.mock.calls[0]

    // Responses API uses different field names and structure
    expect(payload).toMatchObject({
      model: 'gpt-4o-mini',
      temperature: 0.25,
      top_p: 0.6,
      max_output_tokens: 1024, // Responses API uses max_output_tokens instead of max_tokens
      stream: true,
      tool_choice: 'required', // From providerOptions
    })

    // Responses API uses 'input' instead of 'messages'
    expect(payload.input).toBeDefined()

    // Verify tools are included
    expect(payload.tools).toBeDefined()
    expect(Array.isArray(payload.tools)).toBe(true)
    expect(payload.tools.length).toBeGreaterThan(0)
  })
})
