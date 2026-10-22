import type { TokenUsage } from '@tanstack/ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { AnthropicTextAdapter } from '../src/adapters/text'
import type { AdapterYieldChunk } from '@tanstack/ai'
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
  new AnthropicTextAdapter({ apiKey: 'test-key' }, 'claude-sonnet-4-5')

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

function createFailingStream(
  chunks: Array<Record<string, unknown>>,
  error: Error,
): AsyncIterable<Record<string, unknown>> {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk
      }
      throw error
    },
  }
}

describe('Anthropic usage extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts basic token usage from message_delta', async () => {
    const mockStream = createMockStream([
      {
        type: 'message_start',
        message: {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-sonnet-4-5',
          usage: {
            input_tokens: 100,
            output_tokens: 0,
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
        delta: { type: 'text_delta', text: 'Hello world' },
      },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      },
      {
        type: 'message_stop',
      },
    ])

    mocks.betaMessagesCreate.mockResolvedValueOnce(mockStream)

    const chunks: Array<AdapterYieldChunk> = []
    for await (const chunk of chat({
      threadId: 'thread-1',
      adapter: createAdapter(),
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
    expect(doneChunk).toBeDefined()
    expect(doneChunk?.usage).toMatchObject({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    })
  })

  it('adds cache read and cache write tokens to promptTokens', async () => {
    const mockStream = createMockStream([
      {
        type: 'message_start',
        message: {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-sonnet-4-5',
          usage: {
            input_tokens: 100,
            output_tokens: 0,
            cache_creation_input_tokens: 50,
            cache_read_input_tokens: 25,
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
        delta: { type: 'text_delta', text: 'Hello world' },
      },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 50,
          cache_read_input_tokens: 25,
        },
      },
      {
        type: 'message_stop',
      },
    ])

    mocks.betaMessagesCreate.mockResolvedValueOnce(mockStream)

    const chunks: Array<AdapterYieldChunk> = []
    for await (const chunk of chat({
      threadId: 'thread-1',
      adapter: createAdapter(),
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
    expect(doneChunk).toBeDefined()
    // promptTokens = 100 uncached + 25 read + 50 write.
    expect(tokenUsageOf(doneChunk)).toEqual({
      promptTokens: 175,
      completionTokens: 50,
      totalTokens: 225,
      promptTokensDetails: { cacheWriteTokens: 50, cachedTokens: 25 },
    })
  })

  it('counts a cache hit with a null cache write field', async () => {
    // The SDK types the cache fields as `number | null`.
    mocks.betaMessagesCreate.mockResolvedValueOnce(
      createMockStream([
        {
          type: 'message_start',
          message: {
            id: 'msg_123',
            type: 'message',
            role: 'assistant',
            content: [],
            model: 'claude-sonnet-4-5',
            usage: { input_tokens: 12, output_tokens: 0 },
          },
        },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: {
            input_tokens: 12,
            output_tokens: 40,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: 1800,
          },
        },
        { type: 'message_stop' },
      ]),
    )

    const chunks: Array<AdapterYieldChunk> = []
    for await (const chunk of chat({
      threadId: 'thread-1',
      adapter: createAdapter(),
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
    expect(tokenUsageOf(doneChunk)).toEqual({
      promptTokens: 1812,
      completionTokens: 40,
      totalTokens: 1852,
      promptTokensDetails: { cachedTokens: 1800 },
    })
  })

  it('extracts server tool use metrics', async () => {
    const mockStream = createMockStream([
      {
        type: 'message_start',
        message: {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-sonnet-4-5',
          usage: {
            input_tokens: 100,
            output_tokens: 0,
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
        delta: { type: 'text_delta', text: 'Hello world' },
      },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          server_tool_use: {
            web_search_requests: 3,
            web_fetch_requests: 2,
          },
        },
      },
      {
        type: 'message_stop',
      },
    ])

    mocks.betaMessagesCreate.mockResolvedValueOnce(mockStream)

    const chunks: Array<AdapterYieldChunk> = []
    for await (const chunk of chat({
      threadId: 'thread-1',
      adapter: createAdapter(),
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
    expect(doneChunk).toBeDefined()
    expect(tokenUsageOf(doneChunk)?.providerUsageDetails).toMatchObject({
      serverToolUse: {
        webSearchRequests: 3,
        webFetchRequests: 2,
      },
    })
  })

  it('handles response with no cache tokens', async () => {
    const mockStream = createMockStream([
      {
        type: 'message_start',
        message: {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-sonnet-4-5',
          usage: {
            input_tokens: 100,
            output_tokens: 0,
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
        delta: { type: 'text_delta', text: 'Hello world' },
      },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      },
      {
        type: 'message_stop',
      },
    ])

    mocks.betaMessagesCreate.mockResolvedValueOnce(mockStream)

    const chunks: Array<AdapterYieldChunk> = []
    for await (const chunk of chat({
      threadId: 'thread-1',
      adapter: createAdapter(),
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
    expect(doneChunk).toBeDefined()
    // No cache tokens and no server tool use: the detail objects must be
    // omitted entirely rather than emitted as empty `{}` (matches every other
    // adapter's guarded behavior).
    expect(tokenUsageOf(doneChunk)?.promptTokensDetails).toBeUndefined()
    expect(tokenUsageOf(doneChunk)?.providerUsageDetails).toBeUndefined()
  })

  it('reports the 1-hour part of a cache write as cacheWrite1hTokens', async () => {
    mocks.betaMessagesCreate.mockResolvedValueOnce(
      createMockStream([
        {
          type: 'message_start',
          message: {
            id: 'msg_123',
            type: 'message',
            role: 'assistant',
            content: [],
            model: 'claude-sonnet-4-5',
            usage: {
              input_tokens: 10,
              output_tokens: 1,
              cache_creation_input_tokens: 1000,
              cache_read_input_tokens: 0,
              cache_creation: {
                ephemeral_5m_input_tokens: 200,
                ephemeral_1h_input_tokens: 800,
              },
            },
          },
        },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 1 },
        },
        { type: 'message_stop' },
      ]),
    )

    const chunks: Array<AdapterYieldChunk> = []
    for await (const chunk of chat({
      threadId: 'thread-1',
      adapter: createAdapter(),
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
    expect(tokenUsageOf(doneChunk)?.promptTokensDetails).toEqual({
      cacheWriteTokens: 1000,
      cacheWrite1hTokens: 800,
    })
  })

  it('defaults missing output_tokens to 0 instead of NaN', async () => {
    const mockStream = createMockStream([
      {
        type: 'message_start',
        message: {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-sonnet-4-5',
          usage: {
            input_tokens: 100,
            output_tokens: 0,
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
        delta: { type: 'text_delta', text: 'Hello world' },
      },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        // output_tokens intentionally omitted to exercise the `?? 0` guard.
        usage: {
          input_tokens: 100,
        },
      },
      {
        type: 'message_stop',
      },
    ])

    mocks.betaMessagesCreate.mockResolvedValueOnce(mockStream)

    const chunks: Array<AdapterYieldChunk> = []
    for await (const chunk of chat({
      threadId: 'thread-1',
      adapter: createAdapter(),
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
    expect(doneChunk).toBeDefined()
    expect(tokenUsageOf(doneChunk)?.completionTokens).toBe(0)
    expect(tokenUsageOf(doneChunk)?.totalTokens).toBe(100)
    expect(Number.isNaN(tokenUsageOf(doneChunk)?.totalTokens)).toBe(false)
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
          model: 'claude-sonnet-4-5',
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
      threadId: 'thread-1',
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
              model: 'claude-sonnet-4-5',
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
        threadId: 'thread-1',
        model: 'claude-sonnet-4-5',
        messages: [{ role: 'user', content: 'Hello' }],
        logger: createSilentLogger(),
      })) {
        chunks.push(chunk)
      }

      const terminal = chunks.find((c) => c.type === terminalType)
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
            model: 'claude-sonnet-4-5',
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
      threadId: 'thread-1',
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'Hello' }],
      logger: createSilentLogger(),
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
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
            model: 'claude-sonnet-4-5',
            usage: { input_tokens: 13, output_tokens: 1 },
          },
        },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
        { type: 'message_stop' },
      ]),
    )

    const chunks: Array<AdapterYieldChunk> = []
    for await (const chunk of createAdapter().chatStream({
      threadId: 'thread-1',
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'Hello' }],
      logger: createSilentLogger(),
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
    expect(doneChunk).toBeDefined()
    expect(tokenUsageOf(doneChunk)).toBeUndefined()
  })
  describe('when the stream fails (#1735)', () => {
    const messageStart = {
      type: 'message_start',
      message: {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'claude-opus-4-1',
        usage: {
          input_tokens: 18,
          output_tokens: 1,
          cache_creation_input_tokens: 7,
          cache_read_input_tokens: 40,
        },
      },
    }
    const textDelta = [
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'One, two' },
      },
    ]
    const closingDelta = {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: 5 },
    }

    it.each([
      [
        'after message_start',
        [messageStart, ...textDelta],
        {
          promptTokens: 65,
          completionTokens: 1,
          totalTokens: 66,
          promptTokensDetails: { cacheWriteTokens: 7, cachedTokens: 40 },
        },
      ],
      ['before message_start', [], undefined],
      // The RUN_FINISHED already carried the usage, so the RUN_ERROR must not
      // report it a second time.
      [
        'after the closing message_delta',
        [messageStart, ...textDelta, closingDelta],
        undefined,
      ],
    ])(
      'reports the expected usage on the RUN_ERROR %s',
      async (_, events, expectedUsage) => {
        mocks.betaMessagesCreate.mockResolvedValueOnce(
          createFailingStream(
            events,
            Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
          ),
        )

        const chunks: Array<AdapterYieldChunk> = []
        for await (const chunk of createAdapter().chatStream({
          model: 'claude-opus-4-1',
          threadId: 'thread-1',
          messages: [{ role: 'user', content: 'Count to thirty' }],
          logger: createSilentLogger(),
        })) {
          chunks.push(chunk)
        }

        const errorChunk = chunks.find((c) => c.type === 'RUN_ERROR')
        expect(errorChunk).toMatchObject({ code: 'ECONNRESET' })
        expect(tokenUsageOf(errorChunk)).toEqual(expectedUsage)
      },
    )
  })
})
