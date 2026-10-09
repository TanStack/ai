import { describe, expect, it } from 'vitest'
import {
  insertMissingModels,
  modelIdsFromRequestSchema,
  ttsModelIdsFromCatalog,
} from './elevenlabs'
import type { ElevenLabsCatalogModel } from './elevenlabs'

const SOURCE = `export const ELEVENLABS_TTS_MODELS = [
  'eleven_v3',
  'eleven_flash_v2',
  // Deprecated by ElevenLabs — use \`eleven_flash_v2\`.
  'eleven_turbo_v2',
] as const
`

describe('ttsModelIdsFromCatalog', () => {
  const models: Array<ElevenLabsCatalogModel> = [
    {
      rawId: 'eleven_v3',
      firstSeenAt: 10,
      deprecatedAt: null,
      capabilities: { canDoTextToSpeech: true },
    },
    {
      rawId: 'eleven_v4_turbo',
      firstSeenAt: 30,
      deprecatedAt: null,
      capabilities: { canDoTextToSpeech: true },
    },
    {
      rawId: 'eleven_v4',
      firstSeenAt: 30,
      deprecatedAt: null,
      capabilities: { canDoTextToSpeech: true },
    },
    {
      rawId: 'eleven_english_sts_v2',
      firstSeenAt: 40,
      deprecatedAt: null,
      capabilities: { canDoTextToSpeech: false },
    },
    {
      rawId: 'eleven_old',
      firstSeenAt: 50,
      deprecatedAt: 60,
      capabilities: { canDoTextToSpeech: true },
    },
    {
      rawId: "eleven_v4'; alert(1)",
      firstSeenAt: 90,
      capabilities: { canDoTextToSpeech: true },
    },
  ]

  it('keeps text-to-speech ids, newest first, and drops the rest', () => {
    expect(ttsModelIdsFromCatalog(models)).toEqual([
      'eleven_v4',
      'eleven_v4_turbo',
      'eleven_v3',
    ])
  })
})

describe('insertMissingModels', () => {
  it('prepends missing ids and leaves existing rows in place', () => {
    const next = insertMissingModels(SOURCE, 'ELEVENLABS_TTS_MODELS', [
      'eleven_v4',
      'eleven_v4_turbo',
      'eleven_v3',
    ])
    expect(next).toContain(`export const ELEVENLABS_TTS_MODELS = [
  'eleven_v4',
  'eleven_v4_turbo',
  'eleven_v3',
  'eleven_flash_v2',`)
    expect(next).toContain("'eleven_turbo_v2'")
    expect(
      insertMissingModels(next, 'ELEVENLABS_TTS_MODELS', [
        'eleven_v4',
        'eleven_v3',
      ]),
    ).toBe(next)
  })

  it('prepends into the audio array and leaves the speech array alone', () => {
    const both = `${SOURCE}
export const ELEVENLABS_AUDIO_MODELS = [
  'music_v2',
  'eleven_text_to_sound_v2',
] as const satisfies ReadonlyArray<string>
`
    const next = insertMissingModels(both, 'ELEVENLABS_AUDIO_MODELS', [
      'music_v2_5',
      'music_v2',
    ])
    expect(next).toContain(`export const ELEVENLABS_AUDIO_MODELS = [
  'music_v2_5',
  'music_v2',`)
    expect(next).toContain(`export const ELEVENLABS_TTS_MODELS = [
  'eleven_v3',`)
    expect(
      insertMissingModels(next, 'ELEVENLABS_AUDIO_MODELS', ['music_v2_5']),
    ).toBe(next)
  })

  it('refuses an id that is not a safe token', () => {
    expect(() =>
      insertMissingModels(SOURCE, 'ELEVENLABS_TTS_MODELS', ['eleven_v4;']),
    ).toThrow(/Refusing/)
  })

  it('throws when the array marker is missing', () => {
    expect(() =>
      insertMissingModels(
        'export const NOPE = []',
        'ELEVENLABS_TTS_MODELS',
        [],
      ),
    ).toThrow(/not found/)
  })
})

describe('modelIdsFromRequestSchema', () => {
  it('drops deprecated $ref ids and lists the newest enum value first', () => {
    expect(
      modelIdsFromRequestSchema({
        $defs: {
          MusicModelID: {
            enum: ['music_v1', 'music_v2', 'music_v2_5'],
            'x-fern-enum': { music_v1: { deprecated: true } },
          },
        },
        properties: { model_id: { $ref: '#/$defs/MusicModelID' } },
      }),
    ).toEqual(['music_v2_5', 'music_v2'])
  })

  it('reads an inline voice-design enum newest first', () => {
    expect(
      modelIdsFromRequestSchema({
        properties: {
          model_id: {
            enum: ['eleven_multilingual_ttv_v2', 'eleven_ttv_v3'],
          },
        },
      }),
    ).toEqual(['eleven_ttv_v3', 'eleven_multilingual_ttv_v2'])
  })

  it('throws when model_id is missing or unsafe', () => {
    expect(() => modelIdsFromRequestSchema({ properties: {} })).toThrow(
      /model_id/,
    )
    expect(() =>
      modelIdsFromRequestSchema({
        properties: { model_id: { enum: ['music_v2;'] } },
      }),
    ).toThrow(/Refusing/)
  })
})
