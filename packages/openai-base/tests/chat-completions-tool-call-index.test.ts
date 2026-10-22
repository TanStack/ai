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

describe('OpenAIBaseChatCompletionsTextAdapter — tool call deltas without an index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function endedToolCalls(
    streamId: string,
    calls: Array<Record<string, unknown>>,
  ) {
    setupMockSdkClient([
      ...calls.map((toolCall) => ({
        id: streamId,
        model: 'test-model',
        choices: [{ delta: { tool_calls: [toolCall] }, finish_reason: null }],
      })),
      {
        id: streamId,
        model: 'test-model',
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
      },
    ])
    const chunks: Array<AdapterYieldChunk> = []
    for await (const chunk of new TestChatCompletionsAdapter(
      testConfig,
      'test-model',
    ).chatStream({
      logger: testLogger,
      threadId: 'thread-1',
      model: 'test-model',
      messages: [{ role: 'user', content: 'Weather and time in Berlin?' }],
      tools: [weatherTool],
    })) {
      chunks.push(chunk)
    }
    return chunks.flatMap((c) =>
      c.type === EventType.TOOL_CALL_END
        ? [[c.toolCallId, c.toolCallName, c.args]]
        : [],
    )
  }

  it('keeps parallel tool calls apart when the provider omits the index', async () => {
    await expect(
      endedToolCalls('chatcmpl-no-index', [
        {
          id: 'call_a',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"location":' },
        },
        { function: { arguments: '"Berlin"}' } },
        {
          id: 'call_b',
          type: 'function',
          function: { name: 'get_time', arguments: '{"tz":"CET"}' },
        },
      ]),
    ).resolves.toEqual([
      ['call_a', 'get_weather', '{"location":"Berlin"}'],
      ['call_b', 'get_time', '{"tz":"CET"}'],
    ])
  })

  it('starts a new call for a different name without an id (id arrives later)', async () => {
    await expect(
      endedToolCalls('chatcmpl-no-index-no-id', [
        { function: { name: 'get_weather' } },
        { id: 'call_a', function: { arguments: '{"location":"Berlin"}' } },
        { function: { name: 'get_time' } },
        { id: 'call_b', function: { arguments: '{"tz":"CET"}' } },
      ]),
    ).resolves.toEqual([
      ['call_a', 'get_weather', '{"location":"Berlin"}'],
      ['call_b', 'get_time', '{"tz":"CET"}'],
    ])
  })

  it('keeps a repeated name on the same call', async () => {
    await expect(
      endedToolCalls('chatcmpl-repeat-name', [
        { id: 'call_a', type: 'function', function: { name: 'get_weather' } },
        {
          function: { name: 'get_weather', arguments: '{"location":"Berlin"}' },
        },
      ]),
    ).resolves.toEqual([['call_a', 'get_weather', '{"location":"Berlin"}']])
  })

  it('starts a new call when a different name arrives with an id before the previous id', async () => {
    await expect(
      endedToolCalls('chatcmpl-id-while-empty', [
        { function: { name: 'get_weather' } },
        {
          id: 'call_b',
          function: { name: 'get_time', arguments: '{"tz":"CET"}' },
        },
        {
          id: 'call_a',
          function: { name: 'get_weather', arguments: '{"location":"Berlin"}' },
        },
      ]),
    ).resolves.toEqual([
      ['call_b', 'get_time', '{"tz":"CET"}'],
      ['call_a', 'get_weather', '{"location":"Berlin"}'],
    ])
  })

  it('keeps an id and name on the latest call when that call still has no name', async () => {
    await expect(
      endedToolCalls('chatcmpl-args-then-id', [
        { function: { arguments: '{"location":"Berlin"}' } },
        { id: 'call_a', function: { name: 'get_weather' } },
      ]),
    ).resolves.toEqual([['call_a', 'get_weather', '{"location":"Berlin"}']])
  })

  it('does not reuse an index that is still in progress', async () => {
    await expect(
      endedToolCalls('chatcmpl-live-index', [
        {
          index: 0,
          id: 'call_a',
          function: { name: 'get_weather', arguments: '{"location":"Berlin"}' },
        },
        {
          index: 1,
          id: 'call_b',
          function: { name: 'get_time', arguments: '{"tz":"CET"}' },
        },
        { index: 0, function: { arguments: '' } },
        {
          id: 'call_c',
          function: { name: 'get_place', arguments: '{"q":"x"}' },
        },
      ]),
    ).resolves.toEqual([
      ['call_a', 'get_weather', '{"location":"Berlin"}'],
      ['call_b', 'get_time', '{"tz":"CET"}'],
      ['call_c', 'get_place', '{"q":"x"}'],
    ])
  })
})
