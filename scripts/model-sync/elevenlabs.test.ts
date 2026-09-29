import { describe, expect, it } from 'vitest'
import { insertMissingTtsModels, ttsModelIdsFromCatalog } from './elevenlabs'
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

describe('insertMissingTtsModels', () => {
  it('prepends missing ids and leaves existing rows in place', () => {
    const next = insertMissingTtsModels(SOURCE, [
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
    expect(insertMissingTtsModels(next, ['eleven_v4', 'eleven_v3'])).toBe(next)
  })

  it('refuses an id that is not a safe token', () => {
    expect(() => insertMissingTtsModels(SOURCE, ['eleven_v4;'])).toThrow(
      /Refusing/,
    )
  })

  it('throws when the array marker is missing', () => {
    expect(() => insertMissingTtsModels('export const NOPE = []', [])).toThrow(
      /not found/,
    )
  })
})
