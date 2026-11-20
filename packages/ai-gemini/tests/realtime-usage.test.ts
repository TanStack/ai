import { describe, expect, it } from 'vitest'
import { toRealtimeUsage } from '../src/realtime/adapter'

describe('toRealtimeUsage', () => {
  it('folds thinking tokens into completionTokens', () => {
    expect(
      toRealtimeUsage({
        promptTokenCount: 10,
        responseTokenCount: 20,
        thoughtsTokenCount: 30,
        totalTokenCount: 60,
      }),
    ).toEqual({ promptTokens: 10, completionTokens: 50, totalTokens: 60 })
  })

  it('defaults missing counts to 0', () => {
    expect(toRealtimeUsage({ totalTokenCount: 5 })).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 5,
    })
  })
})
