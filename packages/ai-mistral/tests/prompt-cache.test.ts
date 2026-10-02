import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createMistralText } from '../src/adapters/text'
import type { ResolvedPromptCache } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'mistral-large-latest'
const messages = [{ role: 'user' as const, content: 'hi' }]

/** Mistral `usage` as it comes on the wire. */
interface WireUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  prompt_tokens_details?: { cached_tokens: number }
  num_cached_tokens?: number
}

const baseUsage = {
  prompt_tokens: 100,
  completion_tokens: 5,
  total_tokens: 105,
}

/** Stub fetch so the next request gets `response`. */
function stubFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/**
 * Run one streaming call. Return the JSON body it sent and the usage on
 * RUN_FINISHED. The stream has one chunk that finishes with `usage`.
 */
async function stream(options: {
  promptCache?: ResolvedPromptCache
  usage?: WireUsage
}) {
  const chunk = {
    id: 'cmpl-1',
    model,
    choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }],
    usage: options.usage,
  }
  const fetchMock = stubFetch(
    new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`),
  )
  const adapter = createMistralText(model, 'test-key')
  let usage: unknown
  for await (const event of adapter.chatStream({
    logger,
    model,
    messages,
    promptCache: options.promptCache,
  })) {
    if (event.type === 'RUN_FINISHED') usage = event.usage
  }
  const [, init] = fetchMock.mock.calls[0] ?? []
  return { body: JSON.parse(String(init?.body)), usage }
}

describe('Mistral chat({ promptCache }) cache key', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends prompt_cache_key for a retention with a key', async () => {
    const { body } = await stream({
      promptCache: { retention: 'short', key: 'k-1' },
    })
    expect(body.prompt_cache_key).toBe('k-1')
  })

  it.each<[string, ResolvedPromptCache | undefined]>([
    ["'none'", { retention: 'none', key: 'k-1' }],
    ['no key', { retention: 'long' }],
    ['no promptCache', undefined],
  ])('sends no prompt_cache_key for %s', async (_name, promptCache) => {
    const { body } = await stream({ promptCache })
    expect(body).not.toHaveProperty('prompt_cache_key')
  })
})

describe('Mistral cache-read usage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each<[string, WireUsage]>([
    [
      'prompt_tokens_details.cached_tokens',
      { ...baseUsage, prompt_tokens_details: { cached_tokens: 80 } },
    ],
    ['num_cached_tokens', { ...baseUsage, num_cached_tokens: 80 }],
  ])('stream reads cachedTokens from %s', async (_name, usage) => {
    expect((await stream({ usage })).usage).toStrictEqual({
      promptTokens: 100,
      completionTokens: 5,
      totalTokens: 105,
      promptTokensDetails: { cachedTokens: 80 },
    })
  })

  it.each<[string, WireUsage]>([
    ['no cache fields', baseUsage],
    [
      'zero cached tokens',
      { ...baseUsage, prompt_tokens_details: { cached_tokens: 0 } },
    ],
  ])('stream adds no promptTokensDetails for %s', async (_name, usage) => {
    expect((await stream({ usage })).usage).toStrictEqual({
      promptTokens: 100,
      completionTokens: 5,
      totalTokens: 105,
    })
  })

  it('structured output reads cachedTokens through the SDK', async () => {
    stubFetch(
      Response.json({
        id: 'cmpl-1',
        object: 'chat.completion',
        model,
        created: 0,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '{}' },
            finish_reason: 'stop',
          },
        ],
        usage: { ...baseUsage, prompt_tokens_details: { cached_tokens: 80 } },
      }),
    )
    const adapter = createMistralText(model, 'test-key')
    const result = await adapter.structuredOutput({
      chatOptions: { logger, model, messages },
      outputSchema: { type: 'object', properties: {}, required: [] },
    })
    expect(result.usage).toStrictEqual({
      promptTokens: 100,
      completionTokens: 5,
      totalTokens: 105,
      promptTokensDetails: { cachedTokens: 80 },
    })
  })
})
