import { describe, it, expect, vi } from 'vitest'
import {
  HarmBlockThreshold,
  HarmCategory,
  ImagePromptLanguage,
  PersonGeneration,
  SafetyFilterLevel,
  ThinkingLevel,
} from '@google/genai'
import { generateImage } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { GeminiImageAdapter, createGeminiImage } from '../src/adapters/image'
import { GEMINI_NATIVE_IMAGE_MODELS, isGeminiNativeImageModel } from '../src'
import {
  parseNativeImageSize,
  sizeToAspectRatio,
  validateImageSize,
  validateNumberOfImages,
  validatePrompt,
} from '../src/image/image-provider-options'

function interactionWithImages(
  data: string | Array<string>,
  extra: Record<string, unknown> = {},
) {
  const images = (Array.isArray(data) ? data : [data]).map((value) => ({
    type: 'image' as const,
    data: value,
    mime_type: 'image/png',
  }))
  return {
    id: 'int_test',
    status: 'completed',
    output_image: images.at(-1),
    steps: [{ type: 'model_output', content: images }],
    ...extra,
  }
}

/**
 * A native-path adapter whose `client.interactions.create` is stubbed, so
 * tests can assert the exact request handed to the SDK.
 */
function mockedNativeAdapter() {
  const mockCreate = vi.fn().mockResolvedValueOnce(interactionWithImages('out'))
  const adapter = createGeminiImage(
    'gemini-3.1-flash-image-preview',
    'test-api-key',
  )
  ;(
    adapter as unknown as {
      client: { interactions: { create: unknown } }
    }
  ).client = {
    interactions: { create: mockCreate },
  }
  return { adapter, mockCreate }
}

function stubCreate(
  adapter: object,
  mockCreate: ReturnType<typeof vi.fn>,
  mockGenerateImages?: ReturnType<typeof vi.fn>,
) {
  ;(
    adapter as unknown as {
      client: {
        interactions: { create: unknown }
        models?: { generateImages: unknown }
      }
    }
  ).client = {
    interactions: { create: mockCreate },
    ...(mockGenerateImages
      ? { models: { generateImages: mockGenerateImages } }
      : {}),
  }
}

/**
 * An Imagen-path adapter whose `client.models.generateImages` is stubbed, so
 * tests can assert the exact GenerateImagesConfig handed to the SDK.
 */
function mockedImagenAdapter() {
  const mockGenerateImages = vi.fn().mockResolvedValueOnce({
    generatedImages: [{ image: { imageBytes: 'imagen-b64' } }],
  })
  const adapter = createGeminiImage('imagen-4.0-generate-001', 'test-api-key')
  ;(
    adapter as unknown as {
      client: { models: { generateImages: unknown } }
    }
  ).client = {
    models: { generateImages: mockGenerateImages },
  }
  return { adapter, mockGenerateImages }
}

describe('Gemini Image Adapter', () => {
  describe('createGeminiImage', () => {
    it('creates an adapter with the provided API key', () => {
      const adapter = createGeminiImage(
        'imagen-4.0-generate-001',
        'test-api-key',
      )
      expect(adapter).toBeInstanceOf(GeminiImageAdapter)
      expect(adapter.kind).toBe('image')
      expect(adapter.name).toBe('gemini')
    })

    it('has the correct model', () => {
      const adapter = createGeminiImage(
        'imagen-4.0-generate-001',
        'test-api-key',
      )
      expect(adapter.model).toBe('imagen-4.0-generate-001')
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
        validateImageSize('imagen-4.0-generate-001', '1024x1024'),
      ).not.toThrow()
      expect(() =>
        validateImageSize('imagen-4.0-generate-001', '1920x1080'),
      ).not.toThrow()
    })

    it('rejects invalid sizes', () => {
      expect(() =>
        validateImageSize('imagen-4.0-generate-001', '999x999'),
      ).toThrow()
    })

    it('accepts undefined size', () => {
      expect(() =>
        validateImageSize('imagen-4.0-generate-001', undefined),
      ).not.toThrow()
    })
  })

  describe('validateNumberOfImages', () => {
    it('accepts 1-4 images', () => {
      expect(() =>
        validateNumberOfImages('imagen-4.0-generate-001', 1),
      ).not.toThrow()
      expect(() =>
        validateNumberOfImages('imagen-4.0-generate-001', 4),
      ).not.toThrow()
    })

    it('rejects more than 4 images', () => {
      expect(() =>
        validateNumberOfImages('imagen-4.0-generate-001', 5),
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
        validateNumberOfImages('imagen-4.0-generate-001', 0),
      ).toThrow()
    })

    it('accepts undefined', () => {
      expect(() =>
        validateNumberOfImages('imagen-4.0-generate-001', undefined),
      ).not.toThrow()
    })
  })

  describe('validatePrompt', () => {
    it('rejects empty prompts', () => {
      expect(() =>
        validatePrompt({ prompt: '', model: 'imagen-4.0-generate-001' }),
      ).toThrow()
      expect(() =>
        validatePrompt({ prompt: '   ', model: 'imagen-4.0-generate-001' }),
      ).toThrow()
    })

    it('accepts non-empty prompts', () => {
      expect(() =>
        validatePrompt({ prompt: 'A cat', model: 'imagen-4.0-generate-001' }),
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

    it('parses the per-model sizes, including a bare ratio with no resolution', () => {
      // 4:5 / 5:4 are documented for all four native models but were missing
      // from the old shared 8-ratio union; "512" is the wire token for the
      // 0.5K tier — not "512px", not "0.5K".
      expect(parseNativeImageSize('4:5_2K')).toEqual({
        aspectRatio: '4:5',
        resolution: '2K',
      })
      expect(parseNativeImageSize('5:4_1K')).toEqual({
        aspectRatio: '5:4',
        resolution: '1K',
      })
      expect(parseNativeImageSize('1:8_512')).toEqual({
        aspectRatio: '1:8',
        resolution: '512',
      })
      // gemini-2.5-flash-image has no documented image_size, so its sizes are
      // bare ratios: the resolution is absent, not defaulted.
      expect(parseNativeImageSize('16:9')).toEqual({ aspectRatio: '16:9' })
      expect(parseNativeImageSize('16:9')?.resolution).toBeUndefined()
    })

    it('returns undefined for invalid formats', () => {
      expect(parseNativeImageSize('1024x1024')).toBeUndefined()
      expect(parseNativeImageSize('invalid')).toBeUndefined()
      expect(parseNativeImageSize('4K')).toBeUndefined()
      // A trailing separator with no resolution is not a bare ratio.
      expect(parseNativeImageSize('16:9_')).toBeUndefined()
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
        'imagen-4.0-generate-001',
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

      const result = await generateImage({
        adapter,
        prompt: 'A cat wearing a hat',
        numberOfImages: 1,
        size: '1024x1024',
      })

      expect(mockGenerateImages).toHaveBeenCalledWith({
        model: 'imagen-4.0-generate-001',
        prompt: 'A cat wearing a hat',
        config: {
          numberOfImages: 1,
          aspectRatio: '1:1',
        },
      })

      expect(result.model).toBe('imagen-4.0-generate-001')
      expect(result.images).toHaveLength(1)
      expect(result.images[0]!.b64Json).toBe('base64encodedimage')
    })

    it('generates a unique ID for each response', async () => {
      const mockResponse = {
        generatedImages: [{ image: { imageBytes: 'base64' } }],
      }

      const mockGenerateImages = vi.fn().mockResolvedValue(mockResponse)

      const adapter = createGeminiImage(
        'imagen-4.0-generate-001',
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

      const result1 = await generateImage({
        adapter,
        prompt: 'Test prompt',
      })

      const result2 = await generateImage({
        adapter,
        prompt: 'Test prompt',
      })

      expect(result1.id).not.toBe(result2.id)
      expect(result1.id).toMatch(/^gemini-/)
      expect(result2.id).toMatch(/^gemini-/)
    })

    it('calls the Interactions API for Gemini image models', async () => {
      const mockCreate = vi
        .fn()
        .mockResolvedValueOnce(interactionWithImages('gemini-base64-image'))
      const adapter = createGeminiImage(
        'gemini-3.1-flash-image-preview',
        'test-api-key',
      )
      stubCreate(adapter, mockCreate)

      const result = await generateImage({
        adapter,
        prompt: 'A futuristic city',
        size: '16:9_4K',
      })

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gemini-3.1-flash-image-preview',
        input: 'A futuristic city',
        stream: false,
        response_format: {
          type: 'image',
          aspect_ratio: '16:9',
          image_size: '4K',
        },
      })

      expect(result.id).toBe('int_test')
      expect(result.model).toBe('gemini-3.1-flash-image-preview')
      expect(result.images).toHaveLength(1)
      expect(result.images[0]!.b64Json).toBe('gemini-base64-image')
    })

    it('routes Nano Banana 2 Lite (gemini-3.1-flash-lite-image) through the Interactions API', async () => {
      const mockCreate = vi
        .fn()
        .mockResolvedValueOnce(interactionWithImages('lite-base64-image'))
      const adapter = createGeminiImage(
        'gemini-3.1-flash-lite-image',
        'test-api-key',
      )
      stubCreate(adapter, mockCreate)

      const result = await generateImage({
        adapter,
        prompt: 'A red circle',
        // Flash Lite is 1K-only; 2K/4K are rejected at compile time.
        size: '1:1_1K',
      })

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gemini-3.1-flash-lite-image',
        input: 'A red circle',
        stream: false,
        response_format: {
          type: 'image',
          aspect_ratio: '1:1',
          image_size: '1K',
        },
      })

      expect(result.model).toBe('gemini-3.1-flash-lite-image')
      expect(result.images).toHaveLength(1)
      expect(result.images[0]!.b64Json).toBe('lite-base64-image')
    })

    it('routes Nano Banana 2.1 (gemini-nano-banana-2.1) through the Interactions API', async () => {
      const mockCreate = vi
        .fn()
        .mockResolvedValueOnce(interactionWithImages('nb21-base64-image'))
      const adapter = createGeminiImage(
        'gemini-nano-banana-2.1',
        'test-api-key',
      )
      stubCreate(adapter, mockCreate)

      const result = await generateImage({
        adapter,
        prompt: 'A red circle',
        size: '8:1_4K',
      })

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gemini-nano-banana-2.1',
        input: 'A red circle',
        stream: false,
        response_format: {
          type: 'image',
          aspect_ratio: '8:1',
          image_size: '4K',
        },
      })

      expect(result.model).toBe('gemini-nano-banana-2.1')
      expect(result.images[0]!.b64Json).toBe('nb21-base64-image')
    })

    it('routes the GA id gemini-3.1-flash-image through Interactions and sends the 512 tier', async () => {
      const mockCreate = vi
        .fn()
        .mockResolvedValueOnce(interactionWithImages('ga-flash-image'))
      const mockGenerateImages = vi.fn()
      const adapter = createGeminiImage(
        'gemini-3.1-flash-image',
        'test-api-key',
      )
      stubCreate(adapter, mockCreate, mockGenerateImages)

      const result = await generateImage({
        adapter,
        prompt: 'A tall banner',
        size: '1:8_512',
      })

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gemini-3.1-flash-image',
        input: 'A tall banner',
        stream: false,
        response_format: {
          type: 'image',
          aspect_ratio: '1:8',
          image_size: '512',
        },
      })
      expect(mockGenerateImages).not.toHaveBeenCalled()
      expect(result.images[0]!.b64Json).toBe('ga-flash-image')
    })

    it('routes the GA id gemini-3-pro-image through the Interactions API', async () => {
      const mockCreate = vi
        .fn()
        .mockResolvedValueOnce(interactionWithImages('ga-pro-image'))
      const mockGenerateImages = vi.fn()
      const adapter = createGeminiImage('gemini-3-pro-image', 'test-api-key')
      stubCreate(adapter, mockCreate, mockGenerateImages)

      const result = await generateImage({
        adapter,
        prompt: 'A portrait',
        size: '4:5_2K',
      })

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gemini-3-pro-image',
        input: 'A portrait',
        stream: false,
        response_format: {
          type: 'image',
          aspect_ratio: '4:5',
          image_size: '2K',
        },
      })
      expect(mockGenerateImages).not.toHaveBeenCalled()
      expect(result.images[0]!.b64Json).toBe('ga-pro-image')
    })

    it('sends aspect_ratio but no image_size for gemini-2.5-flash-image', async () => {
      // Google documents no image_size for this model, so the adapter must
      // send the ratio alone rather than inventing a resolution tier.
      const mockCreate = vi
        .fn()
        .mockResolvedValueOnce(interactionWithImages('legacy-image'))
      const adapter = createGeminiImage(
        'gemini-2.5-flash-image',
        'test-api-key',
      )
      stubCreate(adapter, mockCreate)

      await generateImage({
        adapter,
        prompt: 'A wide landscape',
        size: '16:9',
      })

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash-image',
        input: 'A wide landscape',
        stream: false,
        response_format: {
          type: 'image',
          aspect_ratio: '16:9',
        },
      })

      const format = mockCreate.mock.calls[0]![0].response_format
      expect('image_size' in format).toBe(false)
    })

    it('surfaces token usage from the interaction (#330)', async () => {
      const mockCreate = vi.fn().mockResolvedValueOnce(
        interactionWithImages('img', {
          usage: {
            total_input_tokens: 12,
            total_output_tokens: 34,
            total_tokens: 46,
          },
        }),
      )
      const adapter = createGeminiImage(
        'gemini-3.1-flash-image-preview',
        'test-api-key',
      )
      stubCreate(adapter, mockCreate)

      const result = await generateImage({
        adapter,
        prompt: 'A futuristic city',
      })

      expect(result.usage).toEqual({
        promptTokens: 12,
        completionTokens: 34,
        totalTokens: 46,
      })
    })

    it('calls interactions.create with image output and no size when none is provided', async () => {
      const mockCreate = vi
        .fn()
        .mockResolvedValueOnce(interactionWithImages('gemini-base64-image'))
      const adapter = createGeminiImage(
        'gemini-3.1-flash-image-preview',
        'test-api-key',
      )
      stubCreate(adapter, mockCreate)

      const result = await generateImage({
        adapter,
        prompt: 'A simple sketch',
      })

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gemini-3.1-flash-image-preview',
        input: 'A simple sketch',
        stream: false,
        response_format: { type: 'image' },
      })

      expect(result.images).toHaveLength(1)
    })

    it('throws when Gemini returns no image parts at all', async () => {
      const mockCreate = vi.fn().mockResolvedValueOnce({
        id: 'int_empty',
        status: 'completed',
        steps: [{ type: 'model_output', content: [] }],
      })
      const adapter = createGeminiImage(
        'gemini-3.1-flash-image-preview',
        'test-api-key',
      )
      stubCreate(adapter, mockCreate)

      await expect(
        generateImage({
          adapter,
          prompt: 'A test prompt',
        }),
      ).rejects.toThrow(/returned no images/)
    })

    it('throws with the refusal text when Gemini returns only text parts', async () => {
      const mockCreate = vi.fn().mockResolvedValueOnce({
        id: 'int_text',
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'text', text: 'I cannot generate that image.' }],
          },
        ],
      })
      const adapter = createGeminiImage(
        'gemini-3.1-flash-image-preview',
        'test-api-key',
      )
      stubCreate(adapter, mockCreate)

      await expect(
        generateImage({
          adapter,
          prompt: 'A test prompt',
        }),
      ).rejects.toThrow(/I cannot generate that image/)
    })

    it('does not let modelOptions disable image output', async () => {
      // Regression: a wholesale modelOptions spread let a caller set
      // responseModalities to text only and silently disable images.
      const { adapter, mockCreate } = mockedNativeAdapter()

      await generateImage({
        adapter,
        prompt: 'A simple sketch',
        modelOptions: {
          responseModalities: ['TEXT'],
        } as unknown as never,
      })

      const args = mockCreate.mock.calls[0]![0]
      expect(args.response_format).toEqual({ type: 'image' })
      expect(args).not.toHaveProperty('response_modalities')
    })

    it('augments prompt when numberOfImages > 1 for Gemini models', async () => {
      const mockCreate = vi.fn().mockResolvedValueOnce({
        id: 'int_many',
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [
              { type: 'image', data: 'img1' },
              { type: 'text', text: 'Here is the second image:' },
              { type: 'image', data: 'img2' },
            ],
          },
        ],
      })
      const adapter = createGeminiImage(
        'gemini-3.1-flash-image-preview',
        'test-api-key',
      )
      stubCreate(adapter, mockCreate)

      const result = await generateImage({
        adapter,
        prompt: 'A futuristic city',
        numberOfImages: 3,
      })

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gemini-3.1-flash-image-preview',
        input: 'A futuristic city Generate 3 distinct images.',
        stream: false,
        response_format: { type: 'image' },
      })

      expect(result.images).toHaveLength(2)
      expect(result.images[0]!.b64Json).toBe('img1')
      expect(result.images[1]!.b64Json).toBe('img2')
    })

    it('does not augment prompt when numberOfImages is 1', async () => {
      const { adapter, mockCreate } = mockedNativeAdapter()

      await generateImage({
        adapter,
        prompt: 'A simple sketch',
        numberOfImages: 1,
      })

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gemini-3.1-flash-image-preview',
        input: 'A simple sketch',
        stream: false,
        response_format: { type: 'image' },
      })
    })

    it('does not augment prompt when numberOfImages is undefined', async () => {
      const { adapter, mockCreate } = mockedNativeAdapter()

      await generateImage({
        adapter,
        prompt: 'A simple sketch',
      })

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gemini-3.1-flash-image-preview',
        input: 'A simple sketch',
        stream: false,
        response_format: { type: 'image' },
      })
    })
  })

  describe('native modelOptions (Interactions API)', () => {
    // Regression: GeminiImageModelProviderOptionsByName used to map every
    // image model — native ones included — to the Imagen-shaped
    // GeminiImageProviderOptions, so these fields were a compile error and the
    // adapter whitelisted only `seed`.
    const safetySettings = [
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
    ]

    it('translates safetySettings to Interactions snake_case', async () => {
      const { adapter, mockCreate } = mockedNativeAdapter()

      await generateImage({
        adapter,
        prompt: 'A quiet harbour',
        modelOptions: { safetySettings },
      })

      const args = mockCreate.mock.calls[0]![0]
      expect(args.safety_settings).toEqual([
        { type: 'hate_speech', threshold: 'block_only_high' },
      ])
    })

    it('rejects thinkingBudget', async () => {
      const { adapter } = mockedNativeAdapter()

      await expect(
        generateImage({
          adapter,
          prompt: 'A quiet harbour',
          modelOptions: { thinkingConfig: { thinkingBudget: 512 } },
        }),
      ).rejects.toThrow(/thinkingBudget/)
    })

    it('maps thinkingLevel and includeThoughts onto generation_config', async () => {
      const { adapter, mockCreate } = mockedNativeAdapter()

      await generateImage({
        adapter,
        prompt: 'A quiet harbour',
        modelOptions: {
          seed: 7,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
            includeThoughts: false,
          },
        },
      })

      const args = mockCreate.mock.calls[0]![0]
      expect(args.generation_config).toEqual({
        seed: 7,
        thinking_level: 'high',
        thinking_summaries: 'none',
      })
    })

    it('forwards systemInstruction as a string', async () => {
      const { adapter, mockCreate } = mockedNativeAdapter()

      await generateImage({
        adapter,
        prompt: 'A quiet harbour',
        modelOptions: { systemInstruction: 'Always render in watercolor.' },
      })

      const args = mockCreate.mock.calls[0]![0]
      expect(args.system_instruction).toBe('Always render in watercolor.')
    })

    it('merges modelOptions.imageConfig over the size-derived format', async () => {
      const { adapter, mockCreate } = mockedNativeAdapter()

      await generateImage({
        adapter,
        prompt: 'A quiet harbour',
        size: '16:9_4K',
        modelOptions: { imageConfig: { imageSize: '2K' } },
      })

      const args = mockCreate.mock.calls[0]![0]
      expect(args.response_format).toEqual({
        type: 'image',
        aspect_ratio: '16:9',
        image_size: '2K',
      })
    })

    it('applies modelOptions.imageConfig when no size is given', async () => {
      const { adapter, mockCreate } = mockedNativeAdapter()

      await generateImage({
        adapter,
        prompt: 'A quiet harbour',
        modelOptions: { imageConfig: { aspectRatio: '21:9' } },
      })

      const args = mockCreate.mock.calls[0]![0]
      expect(args.response_format).toEqual({
        type: 'image',
        aspect_ratio: '21:9',
      })
    })

    it('forwards previous_interaction_id and store, and returns the server id', async () => {
      const { adapter, mockCreate } = mockedNativeAdapter()

      const result = await generateImage({
        adapter,
        prompt: 'Make the water greener',
        modelOptions: {
          previous_interaction_id: 'int_prev',
          store: false,
        },
      })

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gemini-3.1-flash-image-preview',
        input: 'Make the water greener',
        stream: false,
        response_format: { type: 'image' },
        previous_interaction_id: 'int_prev',
        store: false,
      })
      expect(result.id).toBe('int_test')
    })

    it('passes abortSignal only when one is set', async () => {
      const { adapter, mockCreate } = mockedNativeAdapter()
      const controller = new AbortController()
      const logger = resolveDebugOption(false)

      await adapter.generateImages({
        model: 'gemini-3.1-flash-image-preview',
        prompt: 'A quiet harbour',
        logger,
        abortSignal: controller.signal,
      })

      expect(mockCreate).toHaveBeenCalledWith(
        {
          model: 'gemini-3.1-flash-image-preview',
          input: 'A quiet harbour',
          stream: false,
          response_format: { type: 'image' },
        },
        { signal: controller.signal },
      )
    })

    it('throws when Imagen is given previous_interaction_id', async () => {
      const { adapter } = mockedImagenAdapter()

      await expect(
        generateImage({
          adapter,
          prompt: 'A quiet harbour',
          modelOptions: { previous_interaction_id: 'int_prev' } as never,
        }),
      ).rejects.toThrow(/previous_interaction_id/)
    })

    it('keeps Imagen models on GenerateImagesConfig with no native fields', async () => {
      const { adapter, mockGenerateImages } = mockedImagenAdapter()

      await generateImage({
        adapter,
        prompt: 'A quiet harbour',
        size: '1920x1080',
        modelOptions: {
          personGeneration: PersonGeneration.ALLOW_ADULT,
          negativePrompt: 'blurry',
          // Native-only fields. The per-model type rejects them (hence the
          // cast, as in the responseModalities regression test above), but an
          // adapter inferred from a union of model names widens modelOptions
          // to both shapes, so they can still arrive here at runtime — and
          // generateImages answers a GenerateContentConfig field with
          // 400 INVALID_ARGUMENT. The named picks must drop them.
          safetySettings: [
            {
              category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
              threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            },
          ],
          thinkingConfig: { thinkingBudget: 512 },
          imageConfig: { imageSize: '2K' },
          systemInstruction: 'Always render in watercolor.',
        } as unknown as never,
      })

      // Exact match: the Imagen path gets its own GenerateImagesConfig fields
      // and nothing else.
      expect(mockGenerateImages).toHaveBeenCalledWith({
        model: 'imagen-4.0-generate-001',
        prompt: 'A quiet harbour',
        config: {
          numberOfImages: 1,
          aspectRatio: '16:9',
          personGeneration: PersonGeneration.ALLOW_ADULT,
          negativePrompt: 'blurry',
        },
      })
    })

    it('forwards the whole Imagen option set to generateImages', async () => {
      // The Imagen path picks fields by name, so this guards against a field
      // being forgotten in that list.
      const { adapter, mockGenerateImages } = mockedImagenAdapter()

      await generateImage({
        adapter,
        prompt: 'A quiet harbour',
        modelOptions: {
          aspectRatio: '21:9',
          personGeneration: PersonGeneration.ALLOW_ADULT,
          safetyFilterLevel: SafetyFilterLevel.BLOCK_ONLY_HIGH,
          seed: 42,
          addWatermark: false,
          language: ImagePromptLanguage.en,
          negativePrompt: 'blurry',
          outputMimeType: 'image/jpeg',
          outputCompressionQuality: 80,
          guidanceScale: 12,
          enhancePrompt: true,
          includeSafetyAttributes: true,
          includeRaiReason: true,
          outputGcsUri: 'gs://bucket/out',
          labels: { team: 'design' },
        },
      })

      expect(mockGenerateImages).toHaveBeenCalledWith({
        model: 'imagen-4.0-generate-001',
        prompt: 'A quiet harbour',
        config: {
          numberOfImages: 1,
          aspectRatio: '21:9',
          personGeneration: PersonGeneration.ALLOW_ADULT,
          safetyFilterLevel: SafetyFilterLevel.BLOCK_ONLY_HIGH,
          seed: 42,
          addWatermark: false,
          language: ImagePromptLanguage.en,
          negativePrompt: 'blurry',
          outputMimeType: 'image/jpeg',
          outputCompressionQuality: 80,
          guidanceScale: 12,
          enhancePrompt: true,
          includeSafetyAttributes: true,
          includeRaiReason: true,
          outputGcsUri: 'gs://bucket/out',
          labels: { team: 'design' },
        },
      })
    })

    it('lets modelOptions.aspectRatio override the size-derived one', async () => {
      const { adapter, mockGenerateImages } = mockedImagenAdapter()

      await generateImage({
        adapter,
        prompt: 'A quiet harbour',
        size: '1920x1080',
        modelOptions: { aspectRatio: '9:16' },
      })

      const args = mockGenerateImages.mock.calls[0]![0]
      expect(args.config.aspectRatio).toBe('9:16')
    })
  })

  describe('multimodal prompt (image-conditioned generation)', () => {
    const testLogger = resolveDebugOption(false)

    it('maps interleaved prompt parts onto interaction content in order', async () => {
      const { adapter, mockCreate } = mockedNativeAdapter()

      await generateImage({
        adapter,
        prompt: [
          { type: 'text', content: 'Not like this' },
          {
            type: 'image',
            source: { type: 'data', value: 'YmFk', mimeType: 'image/jpeg' },
          },
          { type: 'text', content: 'more like this' },
          {
            type: 'image',
            // Google Files API URIs pass through as uri (no fetch).
            source: {
              type: 'url',
              value:
                'https://generativelanguage.googleapis.com/v1beta/files/abc',
              mimeType: 'image/png',
            },
          },
        ],
      })

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gemini-3.1-flash-image-preview',
        input: [
          { type: 'text', text: 'Not like this' },
          { type: 'image', data: 'YmFk', mime_type: 'image/jpeg' },
          { type: 'text', text: 'more like this' },
          {
            type: 'image',
            uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc',
            mime_type: 'image/png',
          },
        ],
        stream: false,
        response_format: { type: 'image' },
      })
    })

    it('passes arbitrary HTTPS URL sources through as uri without fetching (#907)', async () => {
      const { adapter, mockCreate } = mockedNativeAdapter()

      await generateImage({
        adapter,
        prompt: [
          { type: 'text', content: 'Edit this' },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/photo.jpg' },
          },
        ],
      })

      const args = mockCreate.mock.calls[0]![0]
      expect(args.input).toEqual([
        { type: 'text', text: 'Edit this' },
        {
          type: 'image',
          uri: 'https://example.com/photo.jpg',
          mime_type: 'image/jpeg',
        },
      ])
    })

    it('uses the provided mimeType for URL sources', async () => {
      const { adapter, mockCreate } = mockedNativeAdapter()

      await generateImage({
        adapter,
        prompt: [
          { type: 'text', content: 'Edit this' },
          {
            type: 'image',
            source: {
              type: 'url',
              value: 'https://example.com/photo.png',
              mimeType: 'image/png',
            },
          },
        ],
      })

      const args = mockCreate.mock.calls[0]![0]
      expect(args.input[1]).toEqual({
        type: 'image',
        uri: 'https://example.com/photo.png',
        mime_type: 'image/png',
      })
    })

    it('ignores thought-step images and keeps model_output images', async () => {
      const mockCreate = vi.fn().mockResolvedValueOnce({
        id: 'int_thought',
        status: 'completed',
        output_image: { type: 'image', data: 'final' },
        steps: [
          {
            type: 'thought',
            content: [{ type: 'image', data: 'scratch' }],
          },
          {
            type: 'model_output',
            content: [{ type: 'image', data: 'final' }],
          },
        ],
      })
      const adapter = createGeminiImage(
        'gemini-3.1-flash-image-preview',
        'test-api-key',
      )
      stubCreate(adapter, mockCreate)

      const result = await generateImage({
        adapter,
        prompt: 'A red circle',
      })

      expect(result.images).toEqual([{ b64Json: 'final' }])
    })

    it('maps an image uri when no inline data is present', async () => {
      const mockCreate = vi.fn().mockResolvedValueOnce({
        id: 'int_uri',
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [
              {
                type: 'image',
                uri: 'https://example.com/out.png',
                mime_type: 'image/png',
              },
            ],
          },
        ],
      })
      const adapter = createGeminiImage(
        'gemini-3.1-flash-image-preview',
        'test-api-key',
      )
      stubCreate(adapter, mockCreate)

      const result = await generateImage({
        adapter,
        prompt: 'A red circle',
      })

      expect(result.images).toEqual([{ url: 'https://example.com/out.png' }])
    })

    it('throws when the interaction does not complete', async () => {
      const mockCreate = vi.fn().mockResolvedValueOnce({
        id: 'int_fail',
        status: 'failed',
        steps: [],
      })
      const adapter = createGeminiImage(
        'gemini-3.1-flash-image-preview',
        'test-api-key',
      )
      stubCreate(adapter, mockCreate)

      await expect(
        generateImage({ adapter, prompt: 'A red circle' }),
      ).rejects.toThrow(/failed/)
    })

    it('rejects image prompt parts for Imagen models', async () => {
      const adapter = createGeminiImage(
        'imagen-4.0-generate-001',
        'test-api-key',
      )

      await expect(
        adapter.generateImages({
          model: 'imagen-4.0-generate-001',
          prompt: [
            { type: 'text', content: 'Edit this' },
            {
              type: 'image',
              source: { type: 'data', value: 'aGk=', mimeType: 'image/png' },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/does not support image prompt parts/)
    })

    it('rejects video and audio prompt parts', async () => {
      const adapter = createGeminiImage(
        'gemini-3.1-flash-image-preview',
        'test-api-key',
      )

      await expect(
        adapter.generateImages({
          model: 'gemini-3.1-flash-image-preview',
          prompt: [
            { type: 'text', content: 'x' },
            {
              type: 'video',
              source: { type: 'url', value: 'https://example.com/v.mp4' },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/video prompt parts/)

      await expect(
        adapter.generateImages({
          model: 'gemini-3.1-flash-image-preview',
          prompt: [
            { type: 'text', content: 'x' },
            {
              type: 'audio',
              source: { type: 'url', value: 'https://example.com/a.mp3' },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/audio prompt parts/)
    })
  })
})

describe('GEMINI_NATIVE_IMAGE_MODELS public routing list', () => {
  it('exports the same membership the adapter uses', () => {
    expect(isGeminiNativeImageModel('gemini-3.1-flash-image')).toBe(true)
    expect(isGeminiNativeImageModel('gemini-nano-banana-2.1')).toBe(true)
    expect(isGeminiNativeImageModel('gemini-3-pro-image')).toBe(true)
    expect(isGeminiNativeImageModel('gemini-2.5-flash-image')).toBe(true)
    expect(isGeminiNativeImageModel('imagen-4.0-generate-001')).toBe(false)
    expect(isGeminiNativeImageModel('gemini-9-pro-image')).toBe(false)
    expect(GEMINI_NATIVE_IMAGE_MODELS).toContain('gemini-3.1-flash-image')
  })
})
