import { describe, it, expect, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import type OpenAI from 'openai'
import { OpenAIImageAdapter, createOpenaiImage } from '../src/adapters/image'
import {
  validateImageSize,
  validateNumberOfImages,
  validatePrompt,
} from '../src/image/image-provider-options'
import type { OpenAIImageModel } from '../src/model-meta'

const testLogger = resolveDebugOption(false)

/**
 * Test-only subclass of `OpenAIImageAdapter` that exposes the real
 * `OpenAI` SDK client's `images.generate` method to `vi.spyOn`. Using a
 * subclass + spy (instead of replacing the whole `client` field with a
 * stub) keeps every type real: no `as unknown as` cast, no synthetic stub
 * type, and the original `OpenAI` instance — constructed by the adapter
 * itself — stays in place.
 */
class TestOpenAIImageAdapter<
  TModel extends OpenAIImageModel,
> extends OpenAIImageAdapter<TModel> {
  spyOnImagesGenerate() {
    return vi.spyOn(this.client.images, 'generate')
  }
}

describe('OpenAI Image Adapter', () => {
  describe('createOpenaiImage', () => {
    it('creates an adapter with the provided API key', () => {
      const adapter = createOpenaiImage('gpt-image-1', 'test-api-key')
      expect(adapter).toBeInstanceOf(OpenAIImageAdapter)
      expect(adapter.kind).toBe('image')
      expect(adapter.name).toBe('openai')
    })

    it('has the correct model', () => {
      const adapter = createOpenaiImage('gpt-image-1', 'test-api-key')
      expect(adapter.model).toBe('gpt-image-1')
    })
  })

  describe('validateImageSize', () => {
    describe('gpt-image-1', () => {
      it('accepts valid sizes', () => {
        expect(() =>
          validateImageSize('gpt-image-1', '1024x1024'),
        ).not.toThrow()
        expect(() =>
          validateImageSize('gpt-image-1', '1536x1024'),
        ).not.toThrow()
        expect(() =>
          validateImageSize('gpt-image-1', '1024x1536'),
        ).not.toThrow()
        expect(() => validateImageSize('gpt-image-1', 'auto')).not.toThrow()
      })

      it('rejects invalid sizes', () => {
        expect(() => validateImageSize('gpt-image-1', '512x512')).toThrow()
        expect(() => validateImageSize('gpt-image-1', '1792x1024')).toThrow()
      })

      it('accepts undefined size', () => {
        expect(() => validateImageSize('gpt-image-1', undefined)).not.toThrow()
      })
    })

    describe('dall-e-3', () => {
      it('accepts valid sizes', () => {
        expect(() => validateImageSize('dall-e-3', '1024x1024')).not.toThrow()
        expect(() => validateImageSize('dall-e-3', '1792x1024')).not.toThrow()
        expect(() => validateImageSize('dall-e-3', '1024x1792')).not.toThrow()
      })

      it('rejects invalid sizes', () => {
        expect(() => validateImageSize('dall-e-3', '512x512')).toThrow()
        expect(() => validateImageSize('dall-e-3', '256x256')).toThrow()
      })

      it('accepts auto size (passes through)', () => {
        // auto is treated as a pass-through and not validated
        expect(() => validateImageSize('dall-e-3', 'auto')).not.toThrow()
      })
    })

    describe('dall-e-2', () => {
      it('accepts valid sizes', () => {
        expect(() => validateImageSize('dall-e-2', '256x256')).not.toThrow()
        expect(() => validateImageSize('dall-e-2', '512x512')).not.toThrow()
        expect(() => validateImageSize('dall-e-2', '1024x1024')).not.toThrow()
      })

      it('rejects invalid sizes', () => {
        expect(() => validateImageSize('dall-e-2', '1792x1024')).toThrow()
        expect(() => validateImageSize('dall-e-2', '1024x1792')).toThrow()
      })
    })
  })

  describe('validateNumberOfImages', () => {
    describe('dall-e-3', () => {
      it('only accepts 1 image', () => {
        expect(() => validateNumberOfImages('dall-e-3', 1)).not.toThrow()
        expect(() => validateNumberOfImages('dall-e-3', 2)).toThrow()
        expect(() =>
          validateNumberOfImages('dall-e-3', undefined),
        ).not.toThrow()
      })
    })

    describe('dall-e-2', () => {
      it('accepts 1-10 images', () => {
        expect(() => validateNumberOfImages('dall-e-2', 1)).not.toThrow()
        expect(() => validateNumberOfImages('dall-e-2', 5)).not.toThrow()
        expect(() => validateNumberOfImages('dall-e-2', 10)).not.toThrow()
        expect(() => validateNumberOfImages('dall-e-2', 11)).toThrow()
        expect(() => validateNumberOfImages('dall-e-2', 0)).toThrow()
      })
    })

    describe('gpt-image-1', () => {
      it('accepts 1-10 images', () => {
        expect(() => validateNumberOfImages('gpt-image-1', 1)).not.toThrow()
        expect(() => validateNumberOfImages('gpt-image-1', 10)).not.toThrow()
        expect(() => validateNumberOfImages('gpt-image-1', 11)).toThrow()
      })
    })
  })

  describe('validatePrompt', () => {
    it('rejects empty prompts', () => {
      expect(() =>
        validatePrompt({ prompt: '', model: 'gpt-image-1' }),
      ).toThrow()
    })

    it('accepts whitespace-only prompts (does not trim)', () => {
      // The validation checks length, not trimmed length
      expect(() =>
        validatePrompt({ prompt: '   ', model: 'gpt-image-1' }),
      ).not.toThrow()
    })

    it('accepts non-empty prompts', () => {
      expect(() =>
        validatePrompt({ prompt: 'A cat', model: 'gpt-image-1' }),
      ).not.toThrow()
    })
  })

  describe('generateImages', () => {
    it('calls the OpenAI images.generate API', async () => {
      const mockResponse: OpenAI.Images.ImagesResponse = {
        created: 0,
        data: [
          {
            b64_json: 'base64encodedimage',
            revised_prompt: 'A beautiful cat',
          },
        ],
        usage: {
          input_tokens: 10,
          input_tokens_details: { image_tokens: 0, text_tokens: 10 },
          output_tokens: 100,
          total_tokens: 110,
        },
      }

      const adapter = new TestOpenAIImageAdapter(
        { apiKey: 'test-api-key' },
        'gpt-image-1',
      )
      const mockGenerate = adapter
        .spyOnImagesGenerate()
        .mockResolvedValueOnce(mockResponse)

      const result = await adapter.generateImages({
        model: 'gpt-image-1',
        prompt: 'A cat wearing a hat',
        numberOfImages: 1,
        size: '1024x1024',
        logger: testLogger,
      })

      expect(mockGenerate).toHaveBeenCalledWith({
        model: 'gpt-image-1',
        prompt: 'A cat wearing a hat',
        n: 1,
        size: '1024x1024',
        stream: false,
      })

      expect(result.model).toBe('gpt-image-1')
      expect(result.images).toHaveLength(1)
      expect(result.images[0]!.b64Json).toBe('base64encodedimage')
      expect(result.images[0]!.revisedPrompt).toBe('A beautiful cat')
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 100,
        totalTokens: 110,
        // image_tokens is 0 so it's omitted; only text_tokens is surfaced.
        promptTokensDetails: { textTokens: 10 },
      })
    })

    it('generates a unique ID for each response', async () => {
      const mockResponse: OpenAI.Images.ImagesResponse = {
        created: 0,
        data: [{ b64_json: 'base64' }],
      }

      const adapter = new TestOpenAIImageAdapter(
        { apiKey: 'test-api-key' },
        'gpt-image-1',
      )
      adapter.spyOnImagesGenerate().mockResolvedValue(mockResponse)

      const result1 = await adapter.generateImages({
        model: 'dall-e-3',
        prompt: 'Test prompt',
        logger: testLogger,
      })

      const result2 = await adapter.generateImages({
        model: 'dall-e-3',
        prompt: 'Test prompt',
        logger: testLogger,
      })

      expect(result1.id).not.toBe(result2.id)
      expect(result1.id).toMatch(/^openai-/)
      expect(result2.id).toMatch(/^openai-/)
    })
  })
})
