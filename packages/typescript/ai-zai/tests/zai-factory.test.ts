import { afterEach, describe, expect, it, vi } from 'vitest'
import { createZAIChat, zaiText } from '../src/adapters'
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

  describe('createZAIChat', () => {
    it('creates adapter with explicit API key', () => {
      const adapter = createZAIChat('glm-4.7', 'test_key')
      expect(adapter).toBeInstanceOf(ZAITextAdapter)
      expect(adapter.kind).toBe('text')
      expect(adapter.name).toBe('zai')
      expect(adapter.model).toBe('glm-4.7')
    })

    it('throws error if API key is empty', () => {
      expect(() => createZAIChat('glm-4.7', '')).toThrowError(/apiKey is required/i)
    })

    it('accepts custom baseURL', () => {
      createZAIChat('glm-4.7', 'test_key', { baseURL: 'https://example.invalid/zai' })
      expect(openAIState.lastOptions.baseURL).toBe('https://example.invalid/zai')
    })

    it('returns ZAITextAdapter instance', () => {
      const adapter = createZAIChat('glm-4.6', 'test_key')
      expect(adapter).toBeInstanceOf(ZAITextAdapter)
    })

    it('adapter is properly configured', () => {
      createZAIChat('glm-4.7', 'test_key')
      expect(openAIState.lastOptions.defaultHeaders).toBeTruthy()
      expect(openAIState.lastOptions.defaultHeaders['Accept-Language']).toBe('en-US,en')
    })
  })

  describe('zaiText', () => {
    it('reads from ZAI_API_KEY env var', () => {
      vi.stubEnv('ZAI_API_KEY', 'env_key')
      const adapter = zaiText('glm-4.7')
      expect(adapter).toBeInstanceOf(ZAITextAdapter)
      expect(adapter.model).toBe('glm-4.7')
    })

    it('throws error if env var not set', () => {
      vi.stubEnv('ZAI_API_KEY', '')
      expect(() => zaiText('glm-4.7')).toThrowError(/ZAI_API_KEY is required/i)
    })

    it('accepts custom baseURL', () => {
      vi.stubEnv('ZAI_API_KEY', 'env_key')
      zaiText('glm-4.7', { baseURL: 'https://example.invalid/zai' })
      expect(openAIState.lastOptions.baseURL).toBe('https://example.invalid/zai')
    })

    it('returns ZAITextAdapter instance', () => {
      vi.stubEnv('ZAI_API_KEY', 'env_key')
      const adapter = zaiText('glm-4.6v')
      expect(adapter).toBeInstanceOf(ZAITextAdapter)
    })

    it('adapter is properly configured', () => {
      vi.stubEnv('ZAI_API_KEY', 'env_key')
      zaiText('glm-4.7')
      expect(openAIState.lastOptions.defaultHeaders).toBeTruthy()
      expect(openAIState.lastOptions.defaultHeaders['Accept-Language']).toBe('en-US,en')
    })
  })

  describe('Type Safety', () => {
    it('model parameter is type-checked', () => {
      const adapter = createZAIChat('glm-4.7', 'test_key')
      expect(adapter.model).toBe('glm-4.7')

      // @ts-expect-error invalid model name is caught by types
      createZAIChat('not-a-real-model', 'test_key')
    })

    it('options are type-safe', () => {
      vi.stubEnv('ZAI_API_KEY', 'env_key')
      zaiText('glm-4.7', { baseURL: 'https://example.invalid/zai' })

      // @ts-expect-error baseURL must be a string if provided
      zaiText('glm-4.7', { baseURL: 123 })
    })
  })
})

