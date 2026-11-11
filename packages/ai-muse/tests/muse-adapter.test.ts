import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  MuseTextAdapter,
  createMuseText,
  museText,
} from '../src/adapters/text'
import { MUSE_CHAT_MODELS } from '../src/index'

// Stub the OpenAI-compatible client factory so adapter construction does not
// build a real client or need a live endpoint.
vi.mock('@tanstack/openai-base', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/openai-base')>()),
  createOpenAIClient: () => ({
    chat: { completions: { create: vi.fn() } },
  }),
}))

afterEach(() => {
  delete process.env.MUSE_API_KEY
  delete process.env.MODEL_API_KEY
})

describe('Muse model catalog', () => {
  it('includes the flagship ember model', () => {
    expect(MUSE_CHAT_MODELS).toContain('muse-ember-1.0')
  })

  it('matches the chat models served by the Meta Model API', () => {
    expect(MUSE_CHAT_MODELS).toEqual(
      expect.arrayContaining([
        'muse-ember-1.0',
        'muse-wonder-1.0',
        'muse-spark-1.3',
        'muse-spark-1.3-contributor',
        'muse-spark-1.2',
        'muse-spark-1.2-contributor',
        'muse-spark-1.1',
      ]),
    )
  })

  it('does not list models the Model API does not serve', () => {
    // Muse Glimmer is open-weight / self-hosted only; there is no
    // `muse-glimmer-*` chat model on the Meta Model API.
    expect(MUSE_CHAT_MODELS).not.toContain('muse-glimmer-30b')
  })
})

describe('createMuseText', () => {
  it('builds a muse text adapter with the requested model', () => {
    const adapter = createMuseText('muse-ember-1.0', 'muse_test_key')
    expect(adapter).toBeInstanceOf(MuseTextAdapter)
    expect(adapter.kind).toBe('text')
    expect(adapter.name).toBe('muse')
    expect(adapter.model).toBe('muse-ember-1.0')
  })

  it('reports ember input modalities as text and image', () => {
    const adapter = createMuseText('muse-ember-1.0', 'muse_test_key')
    expect(adapter.inputModalities).toEqual(['text', 'image'])
  })
})

describe('museText', () => {
  it('reads the API key from MUSE_API_KEY', () => {
    process.env.MUSE_API_KEY = 'muse_env_key'
    const adapter = museText('muse-ember-1.0')
    expect(adapter.model).toBe('muse-ember-1.0')
  })

  it('falls back to MODEL_API_KEY (the name in Meta docs)', () => {
    process.env.MODEL_API_KEY = 'meta_env_key'
    const adapter = museText('muse-ember-1.0')
    expect(adapter.model).toBe('muse-ember-1.0')
  })

  it('throws a helpful error when no API key is set', () => {
    expect(() => museText('muse-ember-1.0')).toThrow(/MUSE_API_KEY is required/)
  })
})
