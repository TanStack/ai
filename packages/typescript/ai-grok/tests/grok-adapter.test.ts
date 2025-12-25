import { describe, it, expect, vi, afterEach } from 'vitest'
import { createGrokText, grokText } from '../src/adapters/text'
import { createGrokImage, grokImage } from '../src/adapters/image'
import { createGrokSummarize, grokSummarize } from '../src/adapters/summarize'

describe('Grok adapters', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('Text adapter', () => {
    it('creates a text adapter with explicit API key', () => {
      const adapter = createGrokText('grok-3', 'test-api-key')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('text')
      expect(adapter.name).toBe('grok')
      expect(adapter.model).toBe('grok-3')
    })

    it('creates a text adapter from environment variable', () => {
      vi.stubEnv('XAI_API_KEY', 'env-api-key')

      const adapter = grokText('grok-4-0709')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('text')
      expect(adapter.model).toBe('grok-4-0709')
    })

    it('throws if XAI_API_KEY is not set when using grokText', () => {
      vi.stubEnv('XAI_API_KEY', '')

      expect(() => grokText('grok-3')).toThrow('XAI_API_KEY is required')
    })

    it('allows custom baseURL override', () => {
      const adapter = createGrokText('grok-3', 'test-api-key', {
        baseURL: 'https://custom.api.example.com/v1',
      })

      expect(adapter).toBeDefined()
    })
  })

  describe('Image adapter', () => {
    it('creates an image adapter with explicit API key', () => {
      const adapter = createGrokImage('grok-2-image-1212', 'test-api-key')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('image')
      expect(adapter.name).toBe('grok')
      expect(adapter.model).toBe('grok-2-image-1212')
    })

    it('creates an image adapter from environment variable', () => {
      vi.stubEnv('XAI_API_KEY', 'env-api-key')

      const adapter = grokImage('grok-2-image-1212')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('image')
    })

    it('throws if XAI_API_KEY is not set when using grokImage', () => {
      vi.stubEnv('XAI_API_KEY', '')

      expect(() => grokImage('grok-2-image-1212')).toThrow(
        'XAI_API_KEY is required',
      )
    })
  })

  describe('Summarize adapter', () => {
    it('creates a summarize adapter with explicit API key', () => {
      const adapter = createGrokSummarize('grok-3', 'test-api-key')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('summarize')
      expect(adapter.name).toBe('grok')
      expect(adapter.model).toBe('grok-3')
    })

    it('creates a summarize adapter from environment variable', () => {
      vi.stubEnv('XAI_API_KEY', 'env-api-key')

      const adapter = grokSummarize('grok-4-0709')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('summarize')
    })

    it('throws if XAI_API_KEY is not set when using grokSummarize', () => {
      vi.stubEnv('XAI_API_KEY', '')

      expect(() => grokSummarize('grok-3')).toThrow('XAI_API_KEY is required')
    })
  })
})
