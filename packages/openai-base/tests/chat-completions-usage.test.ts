import { describe, expect, it } from 'vitest'
import { buildChatCompletionsUsage } from '../src/usage'

// Moonshot (Kimi) Chat Completions usage, as documented at
// https://platform.kimi.ai/docs/api/chat
describe('buildChatCompletionsUsage with Moonshot usage', () => {
  it('maps cache reads and cache writes', () => {
    const usage = {
      prompt_tokens: 1000,
      completion_tokens: 50,
      total_tokens: 1050,
      cached_tokens: 800,
      prompt_tokens_details: { cached_tokens: 800, cache_write_tokens: 150 },
    }

    expect(buildChatCompletionsUsage(usage)).toEqual({
      promptTokens: 1000,
      completionTokens: 50,
      totalTokens: 1050,
      promptTokensDetails: { cachedTokens: 800, cacheWriteTokens: 150 },
    })
  })

  it('reads cached_tokens at the root when prompt_tokens_details is absent', () => {
    const usage = {
      prompt_tokens: 1000,
      completion_tokens: 50,
      total_tokens: 1050,
      cached_tokens: 800,
    }

    expect(buildChatCompletionsUsage(usage)).toEqual({
      promptTokens: 1000,
      completionTokens: 50,
      totalTokens: 1050,
      promptTokensDetails: { cachedTokens: 800 },
    })
  })
})
