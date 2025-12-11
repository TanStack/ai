import { describe, it, expect, vi } from 'vitest'
import { GeminiImageAdapter, createGeminiImage } from '../src/adapters/image'
import {
  sizeToAspectRatio,
  validateImageSize,
  validateNumberOfImages,
  validatePrompt,
} from '../src/image/image-provider-options'

describe('Gemini Image Adapter', () => {
  describe('createGeminiImage', () => {
    it('creates an adapter with the provided API key', () => {
      const adapter = createGeminiImage('test-api-key')
      expect(adapter).toBeInstanceOf(GeminiImageAdapter)
      expect(adapter.kind).toBe('image')
      expect(adapter.name).toBe('gemini')
    })

    it('has the correct models', () => {
      const adapter = createGeminiImage('test-api-key')
      expect(adapter.models).toContain('imagen-3.0-generate-002')
      expect(adapter.models).toContain('imagen-4.0-generate-001')
      expect(adapter.models).toContain('imagen-4.0-fast-generate-001')
      expect(adapter.models).toContain('imagen-4.0-ultra-generate-001')
    })
  })

  describe('sizeToAspectRatio', () => {
    it('maps common sizes to aspect ratios', () => {
      expect(sizeToAspectRatio('1024x1024')).toBe('1:1')
      expect(sizeToAspectRatio('512x512')).toBe('1:1')
      expect(sizeToAspectRatio('1920x1080')).toBe('16:9')
      expect(sizeToAspectRatio('1080x1920')).toBe('9:16')
    })

    it('returns undefined for unknown sizes', () => {
      expect(sizeToAspectRatio('999x999')).toBeUndefined()
      expect(sizeToAspectRatio('invalid')).toBeUndefined()
    })

    it('returns undefined for undefined input', () => {
      expect(sizeToAspectRatio(undefined)).toBeUndefined()
    })
  })

  describe('validateImageSize', () => {
    it('accepts valid sizes that map to aspect ratios', () => {
      expect(() =>
        validateImageSize('imagen-3.0-generate-002', '1024x1024'),
      ).not.toThrow()
      expect(() =>
        validateImageSize('imagen-4.0-generate-001', '1920x1080'),
      ).not.toThrow()
    })

    it('rejects invalid sizes', () => {
      expect(() =>
        validateImageSize('imagen-3.0-generate-002', '999x999'),
      ).toThrow()
    })

    it('accepts undefined size', () => {
      expect(() =>
        validateImageSize('imagen-3.0-generate-002', undefined),
      ).not.toThrow()
    })
  })

  describe('validateNumberOfImages', () => {
    it('accepts 1-4 images', () => {
      expect(() =>
        validateNumberOfImages('imagen-3.0-generate-002', 1),
      ).not.toThrow()
      expect(() =>
        validateNumberOfImages('imagen-3.0-generate-002', 4),
      ).not.toThrow()
    })

    it('rejects more than 4 images', () => {
      expect(() =>
        validateNumberOfImages('imagen-3.0-generate-002', 5),
      ).toThrow()
    })

    it('rejects 0 images', () => {
      expect(() =>
        validateNumberOfImages('imagen-3.0-generate-002', 0),
      ).toThrow()
    })

    it('accepts undefined', () => {
      expect(() =>
        validateNumberOfImages('imagen-3.0-generate-002', undefined),
      ).not.toThrow()
    })
  })

  describe('validatePrompt', () => {
    it('rejects empty prompts', () => {
      expect(() =>
        validatePrompt({ prompt: '', model: 'imagen-3.0-generate-002' }),
      ).toThrow()
      expect(() =>
        validatePrompt({ prompt: '   ', model: 'imagen-3.0-generate-002' }),
      ).toThrow()
    })

    it('accepts non-empty prompts', () => {
      expect(() =>
        validatePrompt({ prompt: 'A cat', model: 'imagen-3.0-generate-002' }),
      ).not.toThrow()
    })
  })

  describe('generateImages', () => {
    it('calls the Gemini models.generateImages API', async () => {
      const mockResponse = {
        generatedImages: [
          {
            image: {
              imageBytes: 'base64encodedimage',
            },
          },
        ],
      }

      const mockGenerateImages = vi.fn().mockResolvedValueOnce(mockResponse)

      const adapter = createGeminiImage('test-api-key')
      // Replace the internal Gemini SDK client with our mock
      ;(
        adapter as unknown as {
          client: { models: { generateImages: unknown } }
        }
      ).client = {
        models: {
          generateImages: mockGenerateImages,
        },
      }

      const result = await adapter.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: 'A cat wearing a hat',
        numberOfImages: 1,
        size: '1024x1024',
      })

      expect(mockGenerateImages).toHaveBeenCalledWith({
        model: 'imagen-3.0-generate-002',
        prompt: 'A cat wearing a hat',
        config: {
          numberOfImages: 1,
          aspectRatio: '1:1',
        },
      })

      expect(result.model).toBe('imagen-3.0-generate-002')
      expect(result.images).toHaveLength(1)
      expect(result.images[0].b64Json).toBe('base64encodedimage')
    })

    it('generates a unique ID for each response', async () => {
      const mockResponse = {
        generatedImages: [{ image: { imageBytes: 'base64' } }],
      }

      const mockGenerateImages = vi.fn().mockResolvedValue(mockResponse)

      const adapter = createGeminiImage('test-api-key')
      ;(
        adapter as unknown as {
          client: { models: { generateImages: unknown } }
        }
      ).client = {
        models: {
          generateImages: mockGenerateImages,
        },
      }

      const result1 = await adapter.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: 'Test prompt',
      })

      const result2 = await adapter.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: 'Test prompt',
      })

      expect(result1.id).not.toBe(result2.id)
      expect(result1.id).toMatch(/^gemini-/)
      expect(result2.id).toMatch(/^gemini-/)
    })
  })
})
