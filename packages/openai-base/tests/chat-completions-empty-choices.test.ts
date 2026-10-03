import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAIBaseChatCompletionsTextAdapter } from '../src/adapters/chat-completions-text'
import OpenAI from 'openai'
import { EventType } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import type { AdapterYieldChunk, Tool } from '@tanstack/ai'

const testLogger = resolveDebugOption(false)

/**
 * Narrowed signature for the OpenAI SDK's `chat.completions.create` — see the
 * sibling chat-completions-text.test.ts for the full rationale. The streaming /
 * non-streaming overload union is awkward to `mockImplementation`, and the
 * adapter's behaviour is validated by the AG-UI events it emits rather than by
 * SDK structural typing.
 */
type MockChatCompletionCreate = (
  params: OpenAI.Chat.Completions.ChatCompletionCreateParams,
  options?: OpenAI.RequestOptions,
) => unknown

let mockCreate: ReturnType<typeof vi.fn<MockChatCompletionCreate>>

function makeStubClient(): OpenAI {
  const client = new OpenAI({ apiKey: 'test-api-key' })
  client.chat.completions.create = ((
    params: OpenAI.Chat.Completions.ChatCompletionCreateParams,
    options?: OpenAI.RequestOptions,
  ) => mockCreate(params, options)) as typeof client.chat.completions.create
  return client
}

class TestChatCompletionsAdapter extends OpenAIBaseChatCompletionsTextAdapter<string> {
  constructor(_config: unknown, model: string, name = 'openai-base') {
    super(model, name, makeStubClient())
  }
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

function setupMockSdkClient(streamChunks: Array<Record<string, unknown>>) {
  mockCreate = vi.fn().mockImplementation((params) => {
    if (params.stream) {
      return Promise.resolve(createAsyncIterable(streamChunks))
    }
    return Promise.resolve(undefined)
  })
}

const testConfig = {
  apiKey: 'test-api-key',
  baseURL: 'https://api.test-provider.com/v1',
}

const weatherTool: Tool = {
  name: 'get_weather',
  description: 'Return the forecast for a location',
}

/**
 * Preserve trailing usage and the historical no-finish_reason compatibility
 * case added in PR #676 after issue #371. These mocked chunks describe the
 * adapter's supported behavior, not current provider protocol guarantees.
 */
describe('OpenAIBaseChatCompletionsTextAdapter — usage-only terminal chunk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('finalizes a tool call when finish_reason arrives with the tool-call chunk and usage arrives on a separate empty-choices chunk', async () => {
    const streamChunks = [
      // Chunk 1: opens the tool call AND carries finish_reason on the same
      // chunk (the common shape — finish_reason lands on the last choice chunk).
      {
        id: 'chatcmpl-empty-1',
        model: 'test-model',
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'get_weather', arguments: '{}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      },
      // Final chunk: empty choices, usage only.
      {
        id: 'chatcmpl-empty-1',
        model: 'test-model',
        choices: [],
        usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
      },
    ]

    setupMockSdkClient(streamChunks)
    const adapter = new TestChatCompletionsAdapter(testConfig, 'test-model')
    const chunks: Array<AdapterYieldChunk> = []

    for await (const chunk of adapter.chatStream({
      logger: testLogger,
      model: 'test-model',
      messages: [{ role: 'user', content: 'Weather in Berlin?' }],
      tools: [weatherTool],
    })) {
      chunks.push(chunk)
    }

    const toolEnd = chunks.find((c) => c.type === EventType.TOOL_CALL_END)
    expect(toolEnd).toBeDefined()
    if (toolEnd?.type === EventType.TOOL_CALL_END) {
      expect(toolEnd.toolCallId).toBe('call_1')
      expect(toolEnd.toolName).toBe('get_weather')
    }

    const runFinished = chunks.find((c) => c.type === EventType.RUN_FINISHED)
    expect(runFinished).toBeDefined()
    if (runFinished?.type === EventType.RUN_FINISHED) {
      expect(runFinished.finishReason).toBe('tool_calls')
      expect(runFinished.usage).toMatchObject({
        promptTokens: 12,
        completionTokens: 3,
        totalTokens: 15,
      })
    }
  })

  it('preserves the historical no-finish_reason fallback when the final chunk contains only usage', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-empty-2',
        model: 'test-model',
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"location":"Berlin"}',
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-empty-2',
        model: 'test-model',
        choices: [],
        usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
      },
    ]

    setupMockSdkClient(streamChunks)
    const adapter = new TestChatCompletionsAdapter(testConfig, 'test-model')
    const chunks: Array<AdapterYieldChunk> = []

    for await (const chunk of adapter.chatStream({
      logger: testLogger,
      model: 'test-model',
      messages: [{ role: 'user', content: 'Weather in Berlin?' }],
      tools: [weatherTool],
    })) {
      chunks.push(chunk)
    }

    const toolEnd = chunks.find((c) => c.type === EventType.TOOL_CALL_END)
    expect(toolEnd).toBeDefined()
    if (toolEnd?.type === EventType.TOOL_CALL_END) {
      expect(toolEnd.toolCallId).toBe('call_1')
      expect(toolEnd.toolName).toBe('get_weather')
      expect(toolEnd.input).toEqual({ location: 'Berlin' })
    }

    const runFinished = chunks.find((c) => c.type === EventType.RUN_FINISHED)
    expect(runFinished).toBeDefined()
    if (runFinished?.type === EventType.RUN_FINISHED) {
      // A started/ended tool-call pair was emitted, so the finish reason must
      // surface as `tool_calls` regardless of the missing upstream signal.
      expect(runFinished.finishReason).toBe('tool_calls')
      expect(runFinished.usage).toMatchObject({
        promptTokens: 8,
        completionTokens: 4,
        totalTokens: 12,
      })
    }
  })
})
