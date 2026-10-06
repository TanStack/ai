import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { AnthropicTextAdapter } from '../src/adapters/text'
import type { AdapterYieldChunk, TokenUsage } from '@tanstack/ai'
import type Anthropic_SDK from '@anthropic-ai/sdk'
import { createSilentLogger } from './utils/logger'

/** `chat()` restores a TokenUsage object on RUN_FINISHED. */
function tokenUsageOf(chunk: unknown): TokenUsage | undefined {
  if (typeof chunk !== 'object' || chunk === null || !('usage' in chunk)) {
    return undefined
  }
  const usage = chunk.usage
  if (
    typeof usage !== 'object' ||
    usage === null ||
    Array.isArray(usage) ||
    !('promptTokens' in usage)
  ) {
    return undefined
  }
  return usage as TokenUsage
}

const mocks = vi.hoisted(() => {
  const betaMessagesCreate = vi.fn()

  const client = {
    beta: {
      messages: {
        create: betaMessagesCreate,
      },
    },
  }

  return { betaMessagesCreate, client }
})

vi.mock('@anthropic-ai/sdk', () => {
  const { client } = mocks

  class MockAnthropic {
    beta = client.beta

    constructor(_: { apiKey: string }) {}
  }

  return { default: MockAnthropic }
})

const createAdapter = () =>
  new AnthropicTextAdapter({ apiKey: 'test-key' }, 'claude-opus-4-1')

function createMockStream(
  chunks: Array<Record<string, unknown>>,
): AsyncIterable<Record<string, unknown>> {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

/**
 * Stream one text reply. The final `message_delta` carries `deltaUsage`.
 * Returns the usage that `chat()` puts on RUN_FINISHED.
 */
async function runFinishedUsage(
  deltaUsage: Partial<Anthropic_SDK.Beta.BetaMessageDeltaUsage>,
) {
  mocks.betaMessagesCreate.mockResolvedValueOnce(
    createMockStream([
      {
        type: 'message_start',
        message: {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-opus-4-1',
          usage: { input_tokens: 100, output_tokens: 0 },
        },
      },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello world' },
      },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: deltaUsage,
      },
      { type: 'message_stop' },
    ]),
  )

  const chunks: Array<AdapterYieldChunk> = []
  for await (const chunk of chat({
    adapter: createAdapter(),
    messages: [{ role: 'user', content: 'Hello' }],
  })) {
    chunks.push(chunk)
  }

  const doneChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
  // `unknown` so the loose chunk `usage` type does not leak into the tests.
  const usage: unknown = doneChunk?.usage
  return usage
}

describe('Anthropic usage extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses input_tokens as promptTokens when there are no cache fields', async () => {
    const usage = await runFinishedUsage({
      input_tokens: 100,
      output_tokens: 50,
    })

    // No cache tokens and no server tool use: the detail objects must be
    // omitted entirely rather than emitted as empty `{}` (matches every other
    // adapter's guarded behavior).
    expect(usage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    })
  })

  it('adds cache read and cache write tokens to promptTokens', async () => {
    const usage = await runFinishedUsage({
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 50,
      cache_read_input_tokens: 25,
    })

    // promptTokens = 100 uncached + 25 read + 50 write.
    expect(usage).toEqual({
      promptTokens: 175,
      completionTokens: 50,
      totalTokens: 225,
      promptTokensDetails: {
        cacheWriteTokens: 50,
        cachedTokens: 25,
      },
    })
  })

  it('counts a cache hit with a null cache write field', async () => {
    // The SDK types the cache fields as `number | null`.
    const usage = await runFinishedUsage({
      input_tokens: 12,
      output_tokens: 40,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: 1800,
    })

    expect(usage).toEqual({
      promptTokens: 1812,
      completionTokens: 40,
      totalTokens: 1852,
      promptTokensDetails: { cachedTokens: 1800 },
    })
  })

  it('extracts server tool use metrics', async () => {
    const usage = await runFinishedUsage({
      input_tokens: 100,
      output_tokens: 50,
      server_tool_use: {
        web_search_requests: 3,
        web_fetch_requests: 2,
      },
    })

    expect(usage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      providerUsageDetails: {
        serverToolUse: {
          webSearchRequests: 3,
          webFetchRequests: 2,
        },
      },
    })
  })

  it('defaults missing output_tokens to 0 instead of NaN', async () => {
    // output_tokens intentionally omitted to exercise the `|| 0` guard.
    const usage = await runFinishedUsage({ input_tokens: 100 })

    expect(usage).toEqual({
      promptTokens: 100,
      completionTokens: 0,
      totalTokens: 100,
    })
  })

  it('reports usage on the RUN_ERROR of a max_tokens stop (#1597)', async () => {
    const mockStream = createMockStream([
      {
        type: 'message_start',
        message: {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-opus-4-1',
          usage: {
            input_tokens: 13,
            output_tokens: 1,
            cache_read_input_tokens: 40,
          },
        },
      },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello there' },
      },
      {
        type: 'message_delta',
        delta: { stop_reason: 'max_tokens' },
        usage: {
          input_tokens: 13,
          output_tokens: 3,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 40,
        },
      },
      {
        type: 'message_stop',
      },
    ])

    mocks.betaMessagesCreate.mockResolvedValueOnce(mockStream)

    const chunks: Array<AdapterYieldChunk> = []
    for await (const chunk of chat({
      adapter: createAdapter(),
      messages: [{ role: 'user', content: 'Say hello in five words.' }],
      modelOptions: { max_tokens: 3 },
    })) {
      chunks.push(chunk)
    }

    // The run still ends in RUN_ERROR, and that chunk now carries the tokens
    // that Anthropic billed for the cut-off response.
    const errorChunk = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(errorChunk).toMatchObject({ code: 'max_tokens' })
    // promptTokens is the total input: 13 uncached + 40 cache read.
    expect(tokenUsageOf(errorChunk)).toEqual({
      promptTokens: 53,
      completionTokens: 3,
      totalTokens: 56,
      promptTokensDetails: { cachedTokens: 40 },
    })
  })

  // Anthropic-compatible servers (aimock is one) can send only
  // `output_tokens` on the closing message_delta. The SDK types the other
  // counts there as nullable, and its MessageStream keeps the message_start
  // values (input, cache, and server tool counts) when they are null or
  // missing.
  it.each([
    ['end_turn', 'RUN_FINISHED'],
    ['tool_use', 'RUN_FINISHED'],
    ['max_tokens', 'RUN_ERROR'],
  ] as const)(
    'keeps the message_start counts when the %s message_delta sends only output_tokens',
    async (stopReason, terminalType) => {
      mocks.betaMessagesCreate.mockResolvedValueOnce(
        createMockStream([
          {
            type: 'message_start',
            message: {
              id: 'msg_123',
              type: 'message',
              role: 'assistant',
              content: [],
              model: 'claude-opus-4-1',
              usage: {
                input_tokens: 13,
                output_tokens: 1,
                cache_creation_input_tokens: 7,
                cache_read_input_tokens: 40,
                server_tool_use: { web_search_requests: 2 },
              },
            },
          },
          {
            type: 'message_delta',
            delta: { stop_reason: stopReason },
            usage: { output_tokens: 10 },
          },
          { type: 'message_stop' },
        ]),
      )

      const chunks: Array<AdapterYieldChunk> = []
      for await (const chunk of createAdapter().chatStream({
        model: 'claude-opus-4-1',
        messages: [{ role: 'user', content: 'Hello' }],
        logger: createSilentLogger(),
      })) {
        chunks.push(chunk)
      }

      const terminal = chunks.find((c) => c.type === terminalType)
      // 13 uncached + 7 cache write + 40 cache read.
      expect(tokenUsageOf(terminal)).toEqual({
        promptTokens: 60,
        completionTokens: 10,
        totalTokens: 70,
        promptTokensDetails: { cacheWriteTokens: 7, cachedTokens: 40 },
        providerUsageDetails: { serverToolUse: { webSearchRequests: 2 } },
      })
    },
  )

  it('takes the message_delta counts over message_start when both are present', async () => {
    mocks.betaMessagesCreate.mockResolvedValueOnce(
      createMockStream([
        {
          type: 'message_start',
          message: {
            id: 'msg_123',
            type: 'message',
            role: 'assistant',
            content: [],
            model: 'claude-opus-4-1',
            usage: {
              input_tokens: 13,
              output_tokens: 1,
              cache_creation_input_tokens: 7,
              cache_read_input_tokens: 40,
              server_tool_use: { web_search_requests: 1 },
            },
          },
        },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          // The closing counts are cumulative, so they can be larger than the
          // message_start counts (for example after server tool calls).
          usage: {
            input_tokens: 20,
            output_tokens: 10,
            cache_creation_input_tokens: 8,
            cache_read_input_tokens: 50,
            server_tool_use: { web_search_requests: 3 },
          },
        },
        { type: 'message_stop' },
      ]),
    )

    const chunks: Array<AdapterYieldChunk> = []
    for await (const chunk of createAdapter().chatStream({
      model: 'claude-opus-4-1',
      messages: [{ role: 'user', content: 'Hello' }],
      logger: createSilentLogger(),
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
    // 20 uncached + 8 cache write + 50 cache read.
    expect(tokenUsageOf(doneChunk)).toEqual({
      promptTokens: 78,
      completionTokens: 10,
      totalTokens: 88,
      promptTokensDetails: { cacheWriteTokens: 8, cachedTokens: 50 },
      providerUsageDetails: { serverToolUse: { webSearchRequests: 3 } },
    })
  })

  it('omits usage when the message_delta reports none', async () => {
    mocks.betaMessagesCreate.mockResolvedValueOnce(
      createMockStream([
        {
          type: 'message_start',
          message: {
            id: 'msg_123',
            type: 'message',
            role: 'assistant',
            content: [],
            model: 'claude-opus-4-1',
            usage: { input_tokens: 13, output_tokens: 1 },
          },
        },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
        { type: 'message_stop' },
      ]),
    )

    const chunks: Array<AdapterYieldChunk> = []
    for await (const chunk of createAdapter().chatStream({
      model: 'claude-opus-4-1',
      messages: [{ role: 'user', content: 'Hello' }],
      logger: createSilentLogger(),
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
    expect(doneChunk).toBeDefined()
    expect(tokenUsageOf(doneChunk)).toBeUndefined()
  })
})
