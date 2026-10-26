import { describe, expect, it } from 'vitest'
import { catalogRowToMeta } from './llmgateway'

const minimax = {
  id: 'minimax-m3.1-flash',
  architecture: {
    input_modalities: ['text', 'image'],
    output_modalities: ['text'],
  },
  context_length: 1048576,
  max_output: 524288,
  json_output: false,
  structured_outputs: false,
  providers: [
    {
      tools: true,
      reasoning: true,
      vision: true,
      streaming: true,
      reasoning_efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    },
  ],
}

describe('LLM Gateway catalog rows', () => {
  it('maps reasoning efforts for a chat row', () => {
    const meta = catalogRowToMeta(minimax)
    expect(meta?.reasoning).toEqual({
      levels: {
        low: 'low',
        medium: 'medium',
        high: 'high',
        xhigh: 'xhigh',
        max: 'max',
      },
      budget: false,
    })
    expect(meta?.contextWindow).toBe(1048576)
    expect(meta?.maxCompletionTokens).toBe(524288)
    expect(meta?.features).toContain('tools')
    expect(meta?.features).toContain('reasoning')
  })

  it('maps none to the off level', () => {
    const meta = catalogRowToMeta({
      ...minimax,
      id: 'gpt-5.6-terra',
      providers: [
        {
          reasoning: true,
          reasoning_efforts: ['none', 'low', 'medium', 'high'],
        },
      ],
    })
    expect(meta?.reasoning?.levels).toEqual({
      off: 'none',
      low: 'low',
      medium: 'medium',
      high: 'high',
    })
  })

  it('skips the custom row and provider-prefixed ids', () => {
    expect(catalogRowToMeta({ id: 'custom' })).toBeNull()
    expect(catalogRowToMeta({ id: 'openai/gpt-5.5' })).toBeNull()
    expect(catalogRowToMeta({ id: '' })).toBeNull()
  })
})
