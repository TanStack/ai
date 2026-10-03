import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { AnthropicTextAdapter } from '../src/adapters/text'
import type { AdapterYieldChunk } from '@tanstack/ai'
import type Anthropic_SDK from '@anthropic-ai/sdk'

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
})
