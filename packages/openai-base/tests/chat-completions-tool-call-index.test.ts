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
 * Some OpenAI-compatible providers (Gemini's compatibility endpoint, for
 * example) leave `tool_calls[].index` out. A delta without an index starts the
 * next call when it brings a new id and continues the latest call otherwise;
 * treating a missing index as one shared slot merged parallel calls into one.
 */
describe('OpenAIBaseChatCompletionsTextAdapter — tool call deltas without an index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps parallel tool calls apart when the provider omits the index', async () => {
    const toolCallChunk = (toolCall: Record<string, unknown>) => ({
      id: 'chatcmpl-no-index',
      model: 'test-model',
      choices: [{ delta: { tool_calls: [toolCall] }, finish_reason: null }],
    })
    setupMockSdkClient([
      toolCallChunk({
        id: 'call_a',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"location":' },
      }),
      toolCallChunk({ function: { arguments: '"Berlin"}' } }),
      toolCallChunk({
        id: 'call_b',
        type: 'function',
        function: { name: 'get_time', arguments: '{"tz":"CET"}' },
      }),
      {
        id: 'chatcmpl-no-index',
        model: 'test-model',
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
      },
    ])
    const adapter = new TestChatCompletionsAdapter(testConfig, 'test-model')
    const chunks: Array<AdapterYieldChunk> = []

    for await (const chunk of adapter.chatStream({
      logger: testLogger,
      model: 'test-model',
      messages: [{ role: 'user', content: 'Weather and time in Berlin?' }],
      tools: [weatherTool],
    })) {
      chunks.push(chunk)
    }

    const toolEnds = chunks.flatMap((c) =>
      c.type === EventType.TOOL_CALL_END
        ? [[c.toolCallId, c.toolName, c.args]]
        : [],
    )
    expect(toolEnds).toEqual([
      ['call_a', 'get_weather', '{"location":"Berlin"}'],
      ['call_b', 'get_time', '{"tz":"CET"}'],
    ])
  })
})
