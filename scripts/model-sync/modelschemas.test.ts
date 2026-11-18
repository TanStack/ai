import { describe, expect, it } from 'vitest'
import { chatModels } from './modelschemas'
import type { ModelSchemasModel } from './modelschemas'

const model = (over: Partial<ModelSchemasModel>): ModelSchemasModel => ({
  rawId: 'gpt-9',
  activity: 'chat',
  sameAs: null,
  deprecatedAt: null,
  releasedAt: 100,
  firstSeenAt: 50,
  contextWindow: 400_000,
  maxOutput: 128_000,
  modalities: { input: ['text', 'file'], output: ['text'] },
  capabilities: { tools: true, temperature: false },
  reasoning: { mandatory: true },
  pricing: {
    tables: {
      rate: {
        base: {
          input_tokens: 0.00000125,
          cache_read_tokens: 0.000000125,
          output_tokens: 0.00001,
        },
      },
    },
  },
  ...over,
})

describe('chatModels', () => {
  it('maps a catalogue entry to the generator shape', () => {
    expect(chatModels([model({})])).toEqual([
      {
        id: 'gpt-9',
        created: 100,
        contextLength: 400_000,
        maxOutput: 128_000,
        pricing: { input: 1.25, cached: 0.125, output: 10 },
        inputModalities: ['text', 'file'],
        outputModalities: ['text'],
        supportedParameters: ['tools'],
        reasoningMandatory: true,
      },
    ])
  })

  it('keeps only current chat models', () => {
    const ids = chatModels([
      model({ rawId: 'a' }),
      model({ rawId: 'b', activity: 'image' }),
      model({ rawId: 'c', sameAs: 'a' }),
      model({ rawId: 'd', deprecatedAt: 1 }),
    ]).map((m) => m.id)
    expect(ids).toEqual(['a'])
  })

  it('falls back to firstSeenAt and leaves pricing out without a rate card', () => {
    const [m] = chatModels([model({ releasedAt: null, pricing: null })])
    expect(m?.created).toBe(50)
    expect(m?.pricing).toBeUndefined()
  })
})
