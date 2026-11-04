import { afterEach, describe, expect, it, vi } from 'vitest'
import { createZAIText, zaiText } from '../src/adapters/text'
import {
  createZAISummarize,
  zaiSummarize,
} from '../src/adapters/summarize'
import { ZAITextAdapter } from '../src/adapters/text'

const openAIState = {
  lastOptions: undefined as any,
}

vi.mock('openai', () => {
  class OpenAI {
    chat: any
    constructor(opts: any) {
      openAIState.lastOptions = opts
      this.chat = {
        completions: {
          create: vi.fn(),
        },
      }
    }
  }

  return { default: OpenAI }
})

describe('Z.AI provider factories', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    openAIState.lastOptions = undefined
  })

  describe('createZAIText', () => {
    it('creates an adapter with an explicit API key', () => {
      const adapter = createZAIText('glm-5.2', 'test_key')
      expect(adapter).toBeInstanceOf(ZAITextAdapter)
      expect(adapter.kind).toBe('text')
      expect(adapter.name).toBe('zai')
      expect(adapter.model).toBe('glm-5.2')
    })

    it('throws when the API key is empty', () => {
      expect(() => createZAIText('glm-5.2', '')).toThrowError(
        /API key is required/i,
      )
    })

    it('accepts a custom baseURL', () => {
      createZAIText('glm-5.2', 'test_key', {
        baseURL: 'https://example.invalid/zai',
      })
      expect(openAIState.lastOptions.baseURL).toBe(
        'https://example.invalid/zai',
      )
    })

    it('sets the Z.AI default headers', () => {
      createZAIText('glm-5.2', 'test_key')
      expect(openAIState.lastOptions.defaultHeaders['Accept-Language']).toBe(
        'en-US,en',
      )
    })

    it('uses the coding endpoint when coding: true', () => {
      createZAIText('glm-5.2', 'test_key', { coding: true })
      expect(openAIState.lastOptions.baseURL).toBe(
        'https://api.z.ai/api/coding/paas/v4',
      )
    })

    it('lets an explicit baseURL override the coding flag', () => {
      createZAIText('glm-5.2', 'test_key', {
        coding: true,
        baseURL: 'https://custom.url',
      })
      expect(openAIState.lastOptions.baseURL).toBe('https://custom.url')
    })
  })

  describe('zaiText', () => {
    it('reads the key from ZAI_API_KEY', () => {
      vi.stubEnv('ZAI_API_KEY', 'env_key')
      const adapter = zaiText('glm-5.2')
      expect(adapter).toBeInstanceOf(ZAITextAdapter)
      expect(adapter.model).toBe('glm-5.2')
    })

    it('throws when ZAI_API_KEY is not set', () => {
      vi.stubEnv('ZAI_API_KEY', '')
      expect(() => zaiText('glm-5.2')).toThrowError(/ZAI_API_KEY is required/i)
    })

    it('accepts a custom baseURL', () => {
      vi.stubEnv('ZAI_API_KEY', 'env_key')
      zaiText('glm-5.2', { baseURL: 'https://example.invalid/zai' })
      expect(openAIState.lastOptions.baseURL).toBe(
        'https://example.invalid/zai',
      )
    })

    it('uses the coding endpoint when coding: true', () => {
      vi.stubEnv('ZAI_API_KEY', 'env_key')
      zaiText('glm-5.2', { coding: true })
      expect(openAIState.lastOptions.baseURL).toBe(
        'https://api.z.ai/api/coding/paas/v4',
      )
    })
  })

  describe('Summarize factories', () => {
    it('creates a summarize adapter wrapping the text adapter', () => {
      const adapter = createZAISummarize('glm-5.2', 'test_key')
      expect(adapter.kind).toBe('summarize')
      expect(adapter.name).toBe('zai')
      expect(adapter.model).toBe('glm-5.2')
    })

    it('reads the key from ZAI_API_KEY', () => {
      vi.stubEnv('ZAI_API_KEY', 'env_key')
      const adapter = zaiSummarize('glm-5.2')
      expect(adapter.kind).toBe('summarize')
    })

    it('throws when ZAI_API_KEY is not set', () => {
      vi.stubEnv('ZAI_API_KEY', '')
      expect(() => zaiSummarize('glm-5.2')).toThrowError(
        /ZAI_API_KEY is required/i,
      )
    })
  })

  describe('Type Safety', () => {
    it('rejects an unknown model at the type level', () => {
      const adapter = createZAIText('glm-5.2', 'test_key')
      expect(adapter.model).toBe('glm-5.2')

      // @ts-expect-error invalid model name is caught by types
      createZAIText('not-a-real-model', 'test_key')
    })

    it('rejects a non-string baseURL at the type level', () => {
      vi.stubEnv('ZAI_API_KEY', 'env_key')

      // @ts-expect-error baseURL must be a string if provided
      zaiText('glm-5.2', { baseURL: 123 })
    })
  })
})
