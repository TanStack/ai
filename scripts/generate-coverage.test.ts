import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  COVERAGE_PATH,
  classifyExport,
  extractModalities,
  generateCoverage,
  serializeCoverage,
} from './generate-coverage'

describe('generate-coverage', () => {
  it('classifies export names by suffix and package', () => {
    expect(classifyExport('openai', 'OPENAI_CHAT_MODELS')).toBe('chat')
    expect(classifyExport('anthropic', 'ANTHROPIC_MODELS')).toBe('chat')
    expect(classifyExport('gemini', 'GEMINI_INTERACTIONS_VIDEO_MODELS')).toBe(
      'video',
    )
    expect(classifyExport('codex', 'CODEX_MODELS')).toBe('harness')
    expect(classifyExport('gemini', 'GEMINI_TTS_VOICES')).toBe('ignored')
    expect(classifyExport('openai', 'OPENAI_MYSTERY_LIST')).toBeNull()
  })

  it('extracts modalities from model literals', () => {
    const models = extractModalities(`
      const A = { name: 'a', supports: { input: ['text', 'image'], output: ['text'] } }
      const B = { name: 'b', supports: { input: ['text'] } }
      const C = { name: 'c', other: true }
    `)
    expect(models).toEqual({
      a: { input: ['text', 'image'], output: ['text'] },
      b: { input: ['text'], output: [] },
    })
  })

  it('adapter-coverage.json matches the packages', async () => {
    const committed = JSON.parse(await readFile(COVERAGE_PATH, 'utf8'))
    const fresh = await generateCoverage()
    // generatedAt changes on every run; everything else must not.
    expect(
      serializeCoverage({ ...fresh, generatedAt: committed.generatedAt }),
    ).toBe(serializeCoverage(committed))
  }, 60_000)
})
