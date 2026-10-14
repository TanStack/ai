import { describe, expect, it } from 'vitest'
import { buildResponsesUsage } from '../src/usage'

// OpenAI Responses usage for a call that writes the prompt cache (issue #1734).
describe('buildResponsesUsage', () => {
  it('maps cache reads and cache writes', () => {
    expect(
      buildResponsesUsage({
        input_tokens: 1941,
        input_tokens_details: { cached_tokens: 3, cache_write_tokens: 1938 },
        output_tokens: 5,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 1946,
      }),
    ).toEqual({
      promptTokens: 1941,
      completionTokens: 5,
      totalTokens: 1946,
      promptTokensDetails: { cachedTokens: 3, cacheWriteTokens: 1938 },
    })
  })
})
