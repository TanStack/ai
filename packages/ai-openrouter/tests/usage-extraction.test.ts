import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventType, chat } from '@tanstack/ai'
import { createOpenRouterText } from '../src/adapters/text'
import { createOpenRouterResponsesText } from '../src/adapters/responses-text'
import type { Mock } from 'vitest'
import type { AdapterYieldChunk } from '@tanstack/ai'
import type { ChatUsage, Usage } from '@openrouter/sdk/models'

let mockSend: Mock

// Mock the SDK using a constructor function rather than a `class`.
// `useDefineForClassFields: true` emits real ES2022 class fields, and vitest's
// mock-hoister mis-rewrites a field named `chat` because that identifier is
// also a named import on line 2 (`import { chat } from '@tanstack/ai'`). A plain
// constructor function with `this.*` assignments sidesteps the collision.
vi.mock('@openrouter/sdk', () => {
  function OpenRouter(this: {
    chat: { send: (...args: Array<unknown>) => unknown }
    beta: { responses: { send: (...args: Array<unknown>) => unknown } }
  }) {
    this.chat = {
      send: (...args: Array<unknown>) => mockSend(...args),
    }
    this.beta = {
      responses: { send: (...args: Array<unknown>) => mockSend(...args) },
    }
  }
  return { OpenRouter }
})

function createAsyncIterable<T>(chunks: Array<T>): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0
      return {
        // eslint-disable-next-line @typescript-eslint/require-await
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

async function collect(stream: AsyncIterable<AdapterYieldChunk>) {
  const chunks: Array<AdapterYieldChunk> = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

/** Usage on RUN_FINISHED. `chat()` restores it as a TokenUsage object. */
function finishedUsage(chunks: Array<AdapterYieldChunk>) {
  for (const chunk of chunks) {
    if (chunk.type !== EventType.RUN_FINISHED) continue
    if (Array.isArray(chunk.usage)) {
      throw new Error('expected TokenUsage on RUN_FINISHED, got a usage array')
    }
    return chunk.usage
  }
  throw new Error('stream had no RUN_FINISHED chunk')
}

/** Chat Completions stream: one text delta, then a stop chunk with `usage`. */
function runChatCompletions(usage?: ChatUsage) {
  const streamChunks = [
    {
      id: 'chatcmpl-123',
      model: 'openai/gpt-4o-mini',
      choices: [{ delta: { content: 'Hello world' }, finishReason: null }],
    },
    {
      id: 'chatcmpl-123',
      model: 'openai/gpt-4o-mini',
      choices: [{ delta: {}, finishReason: 'stop' }],
      ...(usage && { usage }),
    },
  ]
  mockSend.mockResolvedValue(createAsyncIterable(streamChunks))
  return collect(
    chat({
      adapter: createOpenRouterText('openai/gpt-4o-mini', 'test-key'),
      messages: [{ role: 'user', content: 'Hello' }],
    }),
  )
}

/** Responses stream that ends with one `response.completed` event. */
function runResponses<T>(completedEvent: T) {
  mockSend.mockResolvedValue(createAsyncIterable([completedEvent]))
  return collect(
    chat({
      adapter: createOpenRouterResponsesText('openai/gpt-4o-mini', 'test-key'),
      messages: [{ role: 'user', content: 'Hello' }],
    }),
  )
}

function responseCompleted(usage: Partial<Usage>) {
  return {
    type: 'response.completed',
    sequenceNumber: 1,
    response: { model: 'openai/gpt-4o-mini', output: [], usage },
  }
}

describe('OpenRouter usage extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSend = vi.fn()
  })

  it('extracts basic token usage from stream', async () => {
    const chunks = await runChatCompletions({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    })

    expect(finishedUsage(chunks)).toMatchObject({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    })
  })

  it('extracts prompt tokens details', async () => {
    const chunks = await runChatCompletions({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      promptTokensDetails: { cachedTokens: 25 },
    })

    expect(finishedUsage(chunks)?.promptTokensDetails).toEqual({
      cachedTokens: 25,
    })
  })

  it('extracts completion tokens details with reasoning tokens', async () => {
    const chunks = await runChatCompletions({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      completionTokensDetails: { reasoningTokens: 30 },
    })

    expect(finishedUsage(chunks)?.completionTokensDetails).toEqual({
      reasoningTokens: 30,
    })
  })

  it('extracts completion tokens details with prediction tokens', async () => {
    const chunks = await runChatCompletions({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      completionTokensDetails: {
        acceptedPredictionTokens: 20,
        rejectedPredictionTokens: 5,
      },
    })

    // Prediction tokens are OpenRouter-specific, so they go in providerUsageDetails
    expect(finishedUsage(chunks)?.providerUsageDetails).toEqual({
      acceptedPredictionTokens: 20,
      rejectedPredictionTokens: 5,
    })
  })

  it('leaves usage undefined when the provider sends no usage data', async () => {
    // AG-UI RUN_FINISHED is always emitted on successful stream completion,
    // but its usage field should be undefined when the provider doesn't
    // include usage data.
    const chunks = await runChatCompletions()

    expect(finishedUsage(chunks)).toBeUndefined()
  })
})

describe('OpenRouter Responses usage extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSend = vi.fn()
  })

  it('maps cached input tokens to promptTokensDetails.cachedTokens', async () => {
    const chunks = await runResponses(
      responseCompleted({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        inputTokensDetails: { cachedTokens: 40 },
      }),
    )

    // promptTokens stays the full input count; cached tokens are a part of it.
    expect(finishedUsage(chunks)).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      promptTokensDetails: { cachedTokens: 40 },
    })
  })

  it('omits promptTokensDetails when no input tokens were cached', async () => {
    const chunks = await runResponses(
      responseCompleted({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        inputTokensDetails: { cachedTokens: 0 },
      }),
    )

    expect(finishedUsage(chunks)).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    })
  })

  it('maps snake_case cached_tokens from the raw stream fallback', async () => {
    // The SDK falls back to `{ isUnknown, raw }` with the snake_case wire
    // payload when an event fails its strict schema.
    const chunks = await runResponses({
      isUnknown: true,
      raw: {
        type: 'response.completed',
        sequence_number: 1,
        response: {
          model: 'openai/gpt-4o-mini',
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
            input_tokens_details: { cached_tokens: 40 },
          },
        },
      },
    })

    expect(finishedUsage(chunks)?.promptTokensDetails).toEqual({
      cachedTokens: 40,
    })
  })
})
