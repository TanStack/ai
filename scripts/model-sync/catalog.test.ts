import { describe, expect, it } from 'vitest'
import {
  alreadySynced,
  hasImageOutput,
  outputsText,
  parseCatalogModels,
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
    inputModalities: ['text'],
    outputModalities: ['text'],
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
          capabilities: { tools: true, reasoning: true, temperature: false },
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

describe('toSyncModel', () => {
  it('takes every field from the native row, and fills nothing', () => {
    expect(
      toSyncModel(
        native({
          rawId: 'grok-5',
          provider: 'grok',
          contextWindow: 2_000_000,
          capabilities: ['tools'],
        }),
        'grok',
      ),
    ).toEqual({
      nativeId: 'grok-5',
      contextWindow: 2_000_000,
      maxOutput: null,
      inputModalities: ['text'],
      outputModalities: ['text'],
      supportedParameters: ['tools'],
      reasoningMandatory: false,
    })
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

  it('skips a row with no input modalities instead of guessing them', () => {
    expect(
      skipNativeModelReason(
        native({ inputModalities: [] }),
        'gemini',
        [],
        cutoff,
        ['chat'],
      ),
    ).toBe('no modalities')
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
      native({
        activity: null,
        rawId: 'qwen/qwen3.8-27b',
        outputModalities: [],
      }),
      'groq',
    )
    expect(outputsText(model, null)).toBe(true)
  })
})

describe('selectNativeInserts', () => {
  const rules = {
    provider: 'anthropic' as const,
    skipPatterns: ['claude-legacy-'],
    acceptedActivities: ['chat'],
    cutoffTimestamp: 0,
  }

  it('inserts a new model with no price and no second source', () => {
    const selection = selectNativeInserts(
      [native({ rawId: 'claude-new-1' })],
      rules,
      () => false,
    )
    expect(selection.inserts.map(({ model }) => model.nativeId)).toEqual([
      'claude-new-1',
    ])
  })

  it('skips a model that is already in the file', () => {
    const selection = selectNativeInserts(
      [native({ rawId: 'claude-new-1' })],
      rules,
      () => true,
    )
    expect(selection.skipped).toEqual({ 'already synced': 1 })
  })

  it('counts every other skip by reason', () => {
    const selection = selectNativeInserts(
      [
        native({ rawId: 'claude-art-1', outputModalities: ['image'] }),
        native({ rawId: 'claude-old-1', deprecatedAt: 1 }),
        native({ rawId: 'claude-sonnet-6:thinking' }),
        native({ rawId: 'claude-legacy-2' }),
        native({ rawId: 'claude-blank-1', inputModalities: [] }),
      ],
      rules,
      () => false,
    )
    expect(selection.inserts).toEqual([])
    expect(selection.skipped).toEqual({
      'image output': 1,
      deprecated: 1,
      'routing variant': 1,
      'skip pattern': 1,
      'no modalities': 1,
    })
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
