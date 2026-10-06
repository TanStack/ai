import { describe, expect, it } from 'vitest'
import { buildConverseUsage } from '../../src/converse/usage'

describe('buildConverseUsage', () => {
  it('reports the cache writes with a 1-hour TTL', () => {
    const usage = buildConverseUsage({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      cacheReadInputTokens: 0,
      cacheWriteInputTokens: 300,
      cacheDetails: [
        { ttl: '1h', inputTokens: 200 },
        { ttl: '5m', inputTokens: 100 },
      ],
    })
    expect(usage.promptTokensDetails).toEqual({
      cachedTokens: 0,
      cacheWriteTokens: 300,
      cacheWrite1hTokens: 200,
    })
  })

  it('sends no 1-hour field without 1-hour writes', () => {
    const usage = buildConverseUsage({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      cacheWriteInputTokens: 100,
      cacheDetails: [{ ttl: '5m', inputTokens: 100 }],
    })
    expect(usage.promptTokensDetails).toEqual({ cacheWriteTokens: 100 })
  })
})
