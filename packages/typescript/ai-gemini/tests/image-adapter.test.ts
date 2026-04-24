import { describe, it, expect, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { GeminiImageAdapter, createGeminiImage } from '../src/adapters/image'
import {
  parseNativeImageSize,
  sizeToAspectRatio,
  validateImageSize,
  validateNumberOfImages,
  validatePrompt,
} from '../src/image/image-provider-options'

const testLogger = resolveDebugOption(false)

describe('Gemini Image Adapter', () => {
  describe('createGeminiImage', () => {
    it('creates an adapter with the provided API key', () => {
      const adapter = createGeminiImage(
        'imagen-3.0-generate-002',
        'test-api-key',
      )
      expect(adapter).toBeInstanceOf(GeminiImageAdapter)
      expect(adapter.kind).toBe('image')
      expect(adapter.name).toBe('gemini')
    })

    it('has the correct model', () => {
      const adapter = createGeminiImage(
        'imagen-3.0-generate-002',
        'test-api-key',
      )
      expect(adapter.model).toBe('imagen-3.0-generate-002')
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

    it('uses the per-model cap for Imagen 4 models', () => {
      // Per-model cap lookup: each Imagen family model has its own max
      // rather than relying on a misleading comment about "up to 8".
      expect(() =>
        validateNumberOfImages('imagen-4.0-generate-001', 4),
      ).not.toThrow()
      expect(() =>
        validateNumberOfImages('imagen-4.0-generate-001', 5),
      ).toThrow(/Must be between 1 and 4/)
    })

    it('falls back to the default cap for unknown models', () => {
      expect(() => validateNumberOfImages('unknown-model', 4)).not.toThrow()
      expect(() => validateNumberOfImages('unknown-model', 5)).toThrow(
        /Must be between 1 and 4/,
      )
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

  describe('parseNativeImageSize', () => {
    it('parses template literal sizes into components', () => {
      expect(parseNativeImageSize('16:9_4K')).toEqual({
        aspectRatio: '16:9',
        resolution: '4K',
      })
      expect(parseNativeImageSize('1:1_2K')).toEqual({
        aspectRatio: '1:1',
        resolution: '2K',
      })
      expect(parseNativeImageSize('21:9_1K')).toEqual({
        aspectRatio: '21:9',
        resolution: '1K',
      })
    })

    it('returns undefined for invalid formats', () => {
      expect(parseNativeImageSize('1024x1024')).toBeUndefined()
      expect(parseNativeImageSize('invalid')).toBeUndefined()
      expect(parseNativeImageSize('16:9')).toBeUndefined()
      expect(parseNativeImageSize('4K')).toBeUndefined()
    })
  })

  describe('generateImages', () => {
    it('calls the Gemini models.generateImages API for Imagen models', async () => {
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

      const adapter = createGeminiImage(
        'imagen-3.0-generate-002',
        'test-api-key',
      )
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
        logger: testLogger,
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

      const adapter = createGeminiImage(
        'imagen-3.0-generate-002',
        'test-api-key',
      )
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
        logger: testLogger,
      })

      const result2 = await adapter.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: 'Test prompt',
        logger: testLogger,
      })

      expect(result1.id).not.toBe(result2.id)
      expect(result1.id).toMatch(/^gemini-/)
      expect(result2.id).toMatch(/^gemini-/)
    })

    it('calls generateContent API for Gemini image models', async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: 'gemini-base64-image',
                  },
                },
              ],
            },
          },
        ],
      }

      const mockGenerateContent = vi.fn().mockResolvedValueOnce(mockResponse)

      const adapter = createGeminiImage(
        'gemini-3.1-flash-image-preview',
        'test-api-key',
      )
      ;(
        adapter as unknown as {
          client: { models: { generateContent: unknown } }
        }
      ).client = {
        models: {
          generateContent: mockGenerateContent,
        },
      }

      const result = await adapter.generateImages({
        model: 'gemini-3.1-flash-image-preview',
        prompt: 'A futuristic city',
        size: '16:9_4K',
        logger: testLogger,
      })

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-3.1-flash-image-preview',
        contents: 'A futuristic city',
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: '16:9',
            imageSize: '4K',
          },
        },
      })

      expect(result.model).toBe('gemini-3.1-flash-image-preview')
      expect(result.images).toHaveLength(1)
      expect(result.images[0].b64Json).toBe('gemini-base64-image')
    })

    it('calls generateContent without imageConfig when no size provided', async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: 'gemini-base64-image',
                  },
                },
              ],
            },
          },
        ],
      }

      const mockGenerateContent = vi.fn().mockResolvedValueOnce(mockResponse)

      const adapter = createGeminiImage(
        'gemini-3.1-flash-image-preview',
        'test-api-key',
      )
      ;(
        adapter as unknown as {
          client: { models: { generateContent: unknown } }
        }
      ).client = {
        models: {
          generateContent: mockGenerateContent,
        },
      }

      const result = await adapter.generateImages({
        model: 'gemini-3.1-flash-image-preview',
        prompt: 'A simple sketch',
        logger: testLogger,
      })

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-3.1-flash-image-preview',
        contents: 'A simple sketch',
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      })

      expect(result.images).toHaveLength(1)
    })

    it('throws when Gemini returns no image parts at all', async () => {
      // Regression: previously returned an empty images array silently,
      // which meant callers couldn't distinguish "safety refusal" from
      // "successful empty response".
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [],
            },
          },
        ],
      }

      const mockGenerateContent = vi.fn().mockResolvedValueOnce(mockResponse)

      const adapter = createGeminiImage(
        'gemini-3.1-flash-image-preview',
        'test-api-key',
      )
      ;(
        adapter as unknown as {
          client: { models: { generateContent: unknown } }
        }
      ).client = {
        models: {
          generateContent: mockGenerateContent,
        },
      }

      await expect(
        adapter.generateImages({
          model: 'gemini-3.1-flash-image-preview',
          prompt: 'A test prompt',
          logger: testLogger,
        }),
      ).rejects.toThrow(/returned no images/)
    })

    it('throws with the refusal text when Gemini returns only text parts', async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'I cannot generate that image.' }],
            },
          },
        ],
      }

      const mockGenerateContent = vi.fn().mockResolvedValueOnce(mockResponse)

      const adapter = createGeminiImage(
        'gemini-3.1-flash-image-preview',
        'test-api-key',
      )
      ;(
        adapter as unknown as {
          client: { models: { generateContent: unknown } }
        }
      ).client = {
        models: {
          generateContent: mockGenerateContent,
        },
      }

      await expect(
        adapter.generateImages({
          model: 'gemini-3.1-flash-image-preview',
          prompt: 'A test prompt',
          logger: testLogger,
        }),
      ).rejects.toThrow(/I cannot generate that image/)
    })

    it('does not let modelOptions override responseModalities', async () => {
      // Regression: modelOptions was spread after responseModalities, so a
      // user could silently break image generation by passing
      // { responseModalities: ['TEXT'] }.
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: 'image/png', data: 'img1' } }],
            },
          },
        ],
      }

      const mockGenerateContent = vi.fn().mockResolvedValueOnce(mockResponse)

      const adapter = createGeminiImage(
        'gemini-3.1-flash-image-preview',
        'test-api-key',
      )
      ;(
        adapter as unknown as {
          client: { models: { generateContent: unknown } }
        }
      ).client = {
        models: {
          generateContent: mockGenerateContent,
        },
      }

      await adapter.generateImages({
        model: 'gemini-3.1-flash-image-preview',
        prompt: 'A simple sketch',
        modelOptions: {
          // User tries to strip IMAGE from modalities — must be ignored.
          responseModalities: ['TEXT'],
        } as unknown as never,
        logger: testLogger,
      })

      const args = mockGenerateContent.mock.calls[0]![0]
      expect(args.config.responseModalities).toEqual(['TEXT', 'IMAGE'])
    })

    it('augments prompt when numberOfImages > 1 for Gemini models', async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: { mimeType: 'image/png', data: 'img1' },
                },
                {
                  text: 'Here is the second image:',
                },
                {
                  inlineData: { mimeType: 'image/png', data: 'img2' },
                },
              ],
            },
          },
        ],
      }

      const mockGenerateContent = vi.fn().mockResolvedValueOnce(mockResponse)

      const adapter = createGeminiImage(
        'gemini-3.1-flash-image-preview',
        'test-api-key',
      )
      ;(
        adapter as unknown as {
          client: { models: { generateContent: unknown } }
        }
      ).client = {
        models: {
          generateContent: mockGenerateContent,
        },
      }

      const result = await adapter.generateImages({
        model: 'gemini-3.1-flash-image-preview',
        prompt: 'A futuristic city',
        numberOfImages: 3,
        logger: testLogger,
      })

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-3.1-flash-image-preview',
        contents: 'A futuristic city Generate 3 distinct images.',
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      })

      // Collects all inlineData parts, skipping text parts
      expect(result.images).toHaveLength(2)
      expect(result.images[0].b64Json).toBe('img1')
      expect(result.images[1].b64Json).toBe('img2')
    })

    it('does not augment prompt when numberOfImages is 1', async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: { mimeType: 'image/png', data: 'img1' },
                },
              ],
            },
          },
        ],
      }

      const mockGenerateContent = vi.fn().mockResolvedValueOnce(mockResponse)

      const adapter = createGeminiImage(
        'gemini-3.1-flash-image-preview',
        'test-api-key',
      )
      ;(
        adapter as unknown as {
          client: { models: { generateContent: unknown } }
        }
      ).client = {
        models: {
          generateContent: mockGenerateContent,
        },
      }

      await adapter.generateImages({
        model: 'gemini-3.1-flash-image-preview',
        prompt: 'A simple sketch',
        numberOfImages: 1,
        logger: testLogger,
      })

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-3.1-flash-image-preview',
        contents: 'A simple sketch',
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      })
    })

    it('does not augment prompt when numberOfImages is undefined', async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: { mimeType: 'image/png', data: 'img1' },
                },
              ],
            },
          },
        ],
      }

      const mockGenerateContent = vi.fn().mockResolvedValueOnce(mockResponse)

      const adapter = createGeminiImage(
        'gemini-3.1-flash-image-preview',
        'test-api-key',
      )
      ;(
        adapter as unknown as {
          client: { models: { generateContent: unknown } }
        }
      ).client = {
        models: {
          generateContent: mockGenerateContent,
        },
      }

      await adapter.generateImages({
        model: 'gemini-3.1-flash-image-preview',
        prompt: 'A simple sketch',
        logger: testLogger,
      })

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-3.1-flash-image-preview',
        contents: 'A simple sketch',
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      })
    })
  })
})
