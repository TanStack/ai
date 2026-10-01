import { describe, expect, it } from 'vitest'
import {
  alreadySynced,
  elevenLabsIdArray,
  findOpenRouterEnrichment,
  hasFullPricing,
  hasImageOutput,
  openRouterRawIdCandidates,
  outputsText,
  parseCatalogModels,
  pricingLines,
  selectElevenLabsInserts,
  selectNativeInserts,
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
      inputPerMillion: undefined,
      outputPerMillion: undefined,
    },
    capabilities: [],
    reasoningMandatory: false,
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
          pricing: {
            per: 'token',
            inputPerMillion: 1.25,
            outputPerMillion: 10,
          },
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
      pricing: { inputPerMillion: 1.25, outputPerMillion: 10 },
    })
  })

  it('maps BytePlus object capabilities onto supported_parameters', () => {
    const models = parseCatalogModels({
      models: [
        {
          rawId: 'deepseek-v4-pro-ga-260813',
          activity: 'chat',
          firstSeenAt: 1_790_000_000,
          deprecatedAt: null,
          capabilities: {
            tools: { function_calling: true },
            structured_outputs: { json_schema: false, json_object: false },
            maxReasoningTokens: 393216,
          },
        },
      ],
    })
    expect(models[0]?.capabilities).toEqual([
      'tools',
      'tool_choice',
      'reasoning',
      'include_reasoning',
    ])
  })
})

describe('parseCatalogModels drift', () => {
  const row = { rawId: 'm', firstSeenAt: 1, deprecatedAt: null }

  it('reads reasoning.mandatory', () => {
    const [model] = parseCatalogModels({
      models: [{ ...row, reasoning: { mode: 'adaptive', mandatory: true } }],
    })
    expect(model?.reasoningMandatory).toBe(true)
  })

  it('throws when no row has a rawId', () => {
    expect(() => parseCatalogModels({ models: [{ id: 'm' }] })).toThrow(
      'none of 1 rows has a rawId',
    )
  })

  it('throws when firstSeenAt is gone, so the age check cannot pass everything', () => {
    expect(() =>
      parseCatalogModels({ models: [{ rawId: 'm', deprecatedAt: null }] }),
    ).toThrow('no row has a firstSeenAt')
  })

  it('throws when deprecatedAt is gone, so deprecated rows cannot pass', () => {
    expect(() =>
      parseCatalogModels({ models: [{ rawId: 'm', firstSeenAt: 1 }] }),
    ).toThrow('no row has a deprecatedAt key')
  })

  it('accepts an empty models array', () => {
    expect(parseCatalogModels({ models: [] })).toEqual([])
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
      pricing: { inputPerMillion: 3, outputPerMillion: 15 },
      capabilities: ['tools', 'temperature'],
    })
    const row = native({ rawId: 'claude-sonnet-4-5' })
    const found = findOpenRouterEnrichment(row, 'anthropic', [enrich])
    expect(found?.rawId).toBe('anthropic/claude-sonnet-4.5')
    const synced = toSyncModel(row, found, 'anthropic')
    expect(synced.nativeId).toBe('claude-sonnet-4-5')
    expect(synced.contextWindow).toBe(200_000)
    expect(synced.supportedParameters).toEqual(['tools', 'temperature'])
    expect(synced.pricing.inputPerMillion).toBe(3)
  })

  it('keeps native capabilities and modalities; OpenRouter only fills empty pricing', () => {
    const enrich = native({
      provider: 'openrouter',
      rawId: 'anthropic/claude-sonnet-4.5',
      contextWindow: 1_000_000,
      inputModalities: ['text', 'image', 'file'],
      outputModalities: ['text'],
      pricing: { inputPerMillion: 3, outputPerMillion: 15 },
      capabilities: ['tools', 'temperature', 'include_reasoning', 'top_k'],
    })
    const row = native({
      rawId: 'claude-sonnet-4-5',
      contextWindow: 200_000,
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      capabilities: ['tools', 'temperature'],
    })
    const synced = toSyncModel(row, enrich, 'anthropic')
    expect(synced.contextWindow).toBe(200_000)
    expect(synced.inputModalities).toEqual(['text', 'image'])
    expect(synced.supportedParameters).toEqual(['tools', 'temperature'])
    expect(synced.pricing.inputPerMillion).toBe(3)
  })

  it('fills a missing price side from OpenRouter without replacing the known one', () => {
    const synced = toSyncModel(
      native({ pricing: { inputPerMillion: 2, outputPerMillion: undefined } }),
      native({ pricing: { inputPerMillion: 3, outputPerMillion: 15 } }),
      'anthropic',
    )
    expect(synced.pricing).toEqual({ inputPerMillion: 2, outputPerMillion: 15 })
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
        ['chat'],
      ),
    ).toBe('dated snapshot')
    expect(
      skipNativeModelReason(
        native({ activity: 'image', rawId: 'grok-imagine-image' }),
        'grok',
        [],
        cutoff,
        ['chat'],
      ),
    ).toBe('activity image')
    expect(
      skipNativeModelReason(
        native({ firstSeenAt: cutoff - 1 }),
        'anthropic',
        [],
        cutoff,
        ['chat'],
      ),
    ).toBe('too old')
  })

  it('keeps a current chat model', () => {
    expect(
      skipNativeModelReason(native(), 'anthropic', [], cutoff, ['chat']),
    ).toBeNull()
  })

  it('treats transcribe ids as non-chat even when activity is chat', () => {
    expect(
      skipNativeModelReason(
        native({ rawId: 'gemini-3.5-transcribe', provider: 'gemini' }),
        'gemini',
        [],
        cutoff,
        ['chat'],
      ),
    ).toBe('non-chat family')
  })

  it('keeps audio rows when audio is an accepted activity', () => {
    expect(
      skipNativeModelReason(
        native({ activity: 'audio', rawId: 'eleven_v3' }),
        'elevenlabs',
        [],
        cutoff,
        ['audio'],
      ),
    ).toBeNull()
  })

  it('keeps Groq rows with no activity', () => {
    expect(
      skipNativeModelReason(
        native({ activity: null, rawId: 'qwen/qwen3.8-27b' }),
        'groq',
        [],
        cutoff,
        [null],
      ),
    ).toBeNull()
  })
})

describe('outputsText', () => {
  it('treats empty modalities plus unset activity as chat', () => {
    const model = toSyncModel(
      native({ activity: null, rawId: 'qwen/qwen3.8-27b' }),
      undefined,
      'groq',
    )
    expect(outputsText(model, null)).toBe(true)
  })
})

describe('elevenLabsIdArray', () => {
  it('routes TTS, skips STS, and classifies scribe / music', () => {
    expect(elevenLabsIdArray('eleven_v3_conversational')).toBe(
      'ELEVENLABS_TTS_MODELS',
    )
    expect(elevenLabsIdArray('eleven_multilingual_sts_v2')).toBeNull()
    expect(elevenLabsIdArray('scribe_v2')).toBe(
      'ELEVENLABS_TRANSCRIPTION_MODELS',
    )
    expect(elevenLabsIdArray('music_v2_5')).toBe('ELEVENLABS_AUDIO_MODELS')
    expect(elevenLabsIdArray('eleven_ttv_v3')).toBe('ELEVENLABS_VOICE_MODELS')
  })
})

describe('selectElevenLabsInserts', () => {
  const audio = (rawId: string) =>
    native({ provider: 'elevenlabs', rawId, activity: 'audio' })

  it('skips ids already in the file and adds a repeated id once', () => {
    const byArray = selectElevenLabsInserts(
      [
        audio('eleven_v3'),
        audio('eleven_v4'),
        audio('eleven_v4'),
        audio('scribe_v3'),
      ],
      0,
      new Set(['eleven_v3']),
    )
    expect(byArray).toEqual({
      ELEVENLABS_TTS_MODELS: ['eleven_v4'],
      ELEVENLABS_AUDIO_MODELS: [],
      ELEVENLABS_TRANSCRIPTION_MODELS: ['scribe_v3'],
      ELEVENLABS_VOICE_MODELS: [],
    })
  })
})

describe('selectNativeInserts', () => {
  const priced = { inputPerMillion: 3, outputPerMillion: 15 }
  const rules = {
    provider: 'anthropic' as const,
    skipPatterns: ['claude-legacy-'],
    acceptedActivities: ['chat'],
    requireOpenRouterEnrich: true,
    cutoffTimestamp: 0,
  }
  const openrouter = [
    native({ rawId: 'anthropic/claude-sonnet-6', pricing: priced }),
    native({ rawId: 'anthropic/claude-art-1', pricing: priced }),
  ]

  it('inserts a priced model and holds back one OpenRouter has not priced', () => {
    const selection = selectNativeInserts(
      [native({ rawId: 'claude-sonnet-6' }), native({ rawId: 'claude-new-1' })],
      rules,
      openrouter,
      () => false,
    )
    expect(selection.inserts.map(({ model }) => model.nativeId)).toEqual([
      'claude-sonnet-6',
    ])
    expect(selection.inserts[0]?.model.pricing).toEqual(priced)
    expect(selection.heldBack).toEqual(['claude-new-1'])
  })

  it('does not hold back a model that is already in the file', () => {
    const selection = selectNativeInserts(
      [native({ rawId: 'claude-new-1' })],
      rules,
      openrouter,
      () => true,
    )
    expect(selection.heldBack).toEqual([])
    expect(selection.skipped).toEqual({ 'already synced': 1 })
  })

  it('counts every other skip by reason', () => {
    const selection = selectNativeInserts(
      [
        native({ rawId: 'claude-art-1', outputModalities: ['image'] }),
        native({ rawId: 'claude-old-1', deprecatedAt: 1 }),
        native({ rawId: 'claude-sonnet-6:thinking' }),
        native({ rawId: 'claude-legacy-2' }),
      ],
      rules,
      openrouter,
      () => false,
    )
    expect(selection.inserts).toEqual([])
    expect(selection.skipped).toEqual({
      'image output': 1,
      deprecated: 1,
      'routing variant': 1,
      'skip pattern': 1,
    })
  })

  it('inserts a Groq model with no price when the price gate is off', () => {
    const selection = selectNativeInserts(
      [native({ provider: 'groq', rawId: 'qwen/qwen9', activity: null })],
      {
        ...rules,
        provider: 'groq',
        acceptedActivities: [null, 'chat'],
        requireOpenRouterEnrich: false,
      },
      openrouter,
      () => false,
    )
    expect(selection.inserts).toHaveLength(1)
    expect(selection.heldBack).toEqual([])
  })
})

describe('pricingLines / hasFullPricing', () => {
  it('leaves an unknown price out instead of writing 0', () => {
    const lines = pricingLines({
      inputPerMillion: undefined,
      outputPerMillion: undefined,
    })
    expect(lines).toEqual(['  pricing: {', '  },'])
    expect(lines.join('\n')).not.toContain('normal: 0')
  })

  it('writes only the known side, rounded', () => {
    const block = pricingLines({
      inputPerMillion: 0.09999999999999999,
      outputPerMillion: undefined,
    }).join('\n')
    expect(block).toContain('normal: 0.1,')
    expect(block).not.toContain('output')
  })

  it('needs both prices for providers whose ModelMeta requires them', () => {
    expect(
      hasFullPricing({ inputPerMillion: 1, outputPerMillion: undefined }),
    ).toBe(false)
    expect(hasFullPricing({ inputPerMillion: 0, outputPerMillion: 0 })).toBe(
      true,
    )
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
