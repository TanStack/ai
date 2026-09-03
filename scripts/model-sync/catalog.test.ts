import { describe, expect, it } from 'vitest'
import {
  alreadySynced,
  findOpenRouterEnrichment,
  hasImageOutput,
  openRouterRawIdCandidates,
  parseCatalogModels,
  skipNativeModelReason,
  toSyncModel,
} from './catalog'
import type { CatalogModel } from './catalog'

function native(overrides: Partial<CatalogModel> = {}): CatalogModel {
  return {
    provider: 'anthropic',
    rawId: 'claude-sonnet-5',
    activity: 'chat',
    firstSeenAt: 1_780_000_000,
    deprecatedAt: null,
    contextWindow: null,
    maxOutput: null,
    inputModalities: [],
    outputModalities: [],
    pricing: {
      prompt: undefined,
      completion: undefined,
      input_cache_read: undefined,
    },
    capabilities: [],
    ...overrides,
  }
}

describe('parseCatalogModels', () => {
  it('reads modelschemas listModels payloads and drops rows without rawId', () => {
    const models = parseCatalogModels({
      count: 2,
      models: [
        {
          provider: 'openai',
          rawId: 'gpt-5',
          activity: 'chat',
          contextWindow: 400_000,
          maxOutput: 128_000,
          modalities: { input: ['text', 'image'], output: ['text'] },
          pricing: { prompt: '0.00000125', completion: '0.00001' },
          capabilities: ['tools', 'reasoning'],
          firstSeenAt: 1_754_425_777,
          deprecatedAt: null,
        },
        { provider: 'openai', activity: 'chat' },
      ],
    })
    expect(models).toHaveLength(1)
    expect(models[0]).toMatchObject({
      rawId: 'gpt-5',
      contextWindow: 400_000,
      inputModalities: ['text', 'image'],
      capabilities: ['tools', 'reasoning'],
    })
  })
})

describe('openRouterRawIdCandidates', () => {
  it('hyphen/dot-maps Anthropic ids and strips dated snapshots', () => {
    expect(
      openRouterRawIdCandidates(
        native({ rawId: 'claude-haiku-4-5-20251001' }),
        'anthropic',
      ),
    ).toEqual([
      'anthropic/claude-haiku-4-5-20251001',
      'anthropic/claude-haiku-4-5',
      'anthropic/claude-haiku-4.5-20251001',
      'anthropic/claude-haiku-4.5',
    ])
  })

  it('prefixes Gemini with google/ and Grok with x-ai/', () => {
    expect(
      openRouterRawIdCandidates(
        native({ rawId: 'gemini-3.1-pro', provider: 'gemini' }),
        'gemini',
      ),
    ).toEqual(['google/gemini-3.1-pro'])
    expect(
      openRouterRawIdCandidates(
        native({ rawId: 'grok-4.6', provider: 'grok' }),
        'grok',
      ),
    ).toEqual(['x-ai/grok-4.6'])
  })
})

describe('findOpenRouterEnrichment / toSyncModel', () => {
  it('joins a hyphenated Anthropic id to the dotted OpenRouter row', () => {
    const enrich = native({
      provider: 'openrouter',
      rawId: 'anthropic/claude-sonnet-4.5',
      contextWindow: 200_000,
      maxOutput: 64_000,
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      pricing: { prompt: '0.000003', completion: '0.000015' },
      capabilities: ['tools', 'temperature'],
    })
    const row = native({ rawId: 'claude-sonnet-4-5' })
    const found = findOpenRouterEnrichment(row, 'anthropic', [enrich])
    expect(found?.rawId).toBe('anthropic/claude-sonnet-4.5')
    const synced = toSyncModel(row, found, 'anthropic')
    expect(synced.nativeId).toBe('claude-sonnet-4-5')
    expect(synced.contextWindow).toBe(200_000)
    expect(synced.supportedParameters).toEqual(['tools', 'temperature'])
    expect(synced.pricing.prompt).toBe('0.000003')
  })
})

describe('skipNativeModelReason', () => {
  const cutoff = 1_700_000_000

  it('skips dated Anthropic snapshots, non-chat activity, and old rows', () => {
    expect(
      skipNativeModelReason(
        native({ rawId: 'claude-haiku-4-5-20251001' }),
        'anthropic',
        [],
        cutoff,
      ),
    ).toBe('dated snapshot')
    expect(
      skipNativeModelReason(
        native({ activity: 'image', rawId: 'grok-imagine-image' }),
        'grok',
        [],
        cutoff,
      ),
    ).toBe('activity image')
    expect(
      skipNativeModelReason(
        native({ firstSeenAt: cutoff - 1 }),
        'anthropic',
        [],
        cutoff,
      ),
    ).toBe('too old')
  })

  it('keeps a current chat model', () => {
    expect(skipNativeModelReason(native(), 'anthropic', [], cutoff)).toBeNull()
  })

  it('treats transcribe ids as non-chat even when activity is chat', () => {
    expect(
      skipNativeModelReason(
        native({ rawId: 'gemini-3.5-transcribe', provider: 'gemini' }),
        'gemini',
        [],
        cutoff,
      ),
    ).toBe('non-chat family')
  })
})

describe('hasImageOutput / alreadySynced', () => {
  it('treats image activity and image output as image models', () => {
    expect(hasImageOutput(native({ activity: 'image' }))).toBe(true)
    expect(
      hasImageOutput(native({ outputModalities: ['image', 'text'] })),
    ).toBe(true)
    expect(hasImageOutput(native({ outputModalities: ['text'] }))).toBe(false)
  })

  it('matches existing ids with dots or dashes', () => {
    expect(
      alreadySynced(
        'claude-sonnet-4.5',
        new Set(['claude-sonnet-4-5']),
        new Set(),
      ),
    ).toBe(true)
    expect(
      alreadySynced('gpt-5.6-luna', new Set(), new Set(['GPT_5_6_LUNA'])),
    ).toBe(true)
    expect(alreadySynced('gpt-5.6-luna', new Set(), new Set())).toBe(false)
  })
})
