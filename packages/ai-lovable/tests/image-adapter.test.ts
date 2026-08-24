import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { LovableImageAdapter, createLovableImage } from '../src/adapters/image'
import type OpenAI from 'openai'
import type { LovableImageModel } from '../src/model-meta'

const testLogger = resolveDebugOption(false)

class TestLovableImageAdapter<
  TModel extends LovableImageModel,
> extends LovableImageAdapter<TModel> {
  spyOnImagesGenerate() {
    return vi.spyOn(this.client.images, 'generate')
  }
  spyOnImagesEdit() {
    return vi.spyOn(this.client.images, 'edit')
  }
}

describe('Lovable image adapter', () => {
  it('creates an adapter with the provided API key', () => {
    const adapter = createLovableImage('openai/gpt-image-2', 'test-api-key')
    expect(adapter).toBeInstanceOf(LovableImageAdapter)
    expect(adapter.kind).toBe('image')
    expect(adapter.name).toBe('lovable')
    expect(adapter.model).toBe('openai/gpt-image-2')
  })

  it('calls images.generate with model, prompt, n, and size', async () => {
    const adapter = new TestLovableImageAdapter(
      { apiKey: 'test-api-key' },
      'openai/gpt-image-2',
    )
    const mockGenerate = adapter.spyOnImagesGenerate().mockResolvedValueOnce({
      created: 0,
      data: [{ b64_json: 'abc' }],
    })

    const abortSignal = new AbortController().signal
    const result = await adapter.generateImages({
      model: 'openai/gpt-image-2',
      prompt: 'a red guitar',
      numberOfImages: 1,
      size: '1024x1024',
      logger: testLogger,
      abortSignal,
    })

    expect(result.images[0]?.b64Json).toBe('abc')
    expect(mockGenerate).toHaveBeenCalledWith(
      {
        model: 'openai/gpt-image-2',
        prompt: 'a red guitar',
        n: 1,
        size: '1024x1024',
        stream: false,
      },
      { signal: abortSignal },
    )
  })

  it('throws when the response contains no usable images', async () => {
    const adapter = new TestLovableImageAdapter(
      { apiKey: 'test-api-key' },
      'openai/gpt-image-2',
    )
    adapter
      .spyOnImagesGenerate()
      .mockResolvedValueOnce({ created: 0, data: [{}] })

    await expect(
      adapter.generateImages({
        model: 'openai/gpt-image-2',
        prompt: 'A cat',
        logger: testLogger,
      }),
    ).rejects.toThrow(/image response contained no images/)
  })

  describe('image edits', () => {
    const imagesEditResponse: OpenAI.Images.ImagesResponse = {
      created: 0,
      data: [{ b64_json: 'edited-base64' }],
    }

    it('routes to images.edit when the prompt has image parts', async () => {
      const adapter = new TestLovableImageAdapter(
        { apiKey: 'test-api-key' },
        'openai/gpt-image-2',
      )
      const editSpy = adapter
        .spyOnImagesEdit()
        .mockResolvedValueOnce(imagesEditResponse)
      const generateSpy = adapter.spyOnImagesGenerate()

      const abortSignal = new AbortController().signal
      const result = await adapter.generateImages({
        model: 'openai/gpt-image-2',
        prompt: [
          { type: 'text', content: 'Make it cinematic' },
          {
            type: 'image',
            source: {
              type: 'data',
              value: 'aGVsbG8=',
              mimeType: 'image/png',
            },
          },
        ],
        logger: testLogger,
        abortSignal,
      })

      expect(generateSpy).not.toHaveBeenCalled()
      expect(editSpy).toHaveBeenCalledTimes(1)
      const editArgs = editSpy.mock.calls[0]![0]
      expect(editArgs.model).toBe('openai/gpt-image-2')
      expect(editArgs.prompt).toBe('Make it cinematic')
      expect(editArgs.image).toBeInstanceOf(File)
      expect(editSpy.mock.calls[0]![1]).toEqual({ signal: abortSignal })
      expect(result.images[0]!.b64Json).toBe('edited-base64')
    })

    it('sends a mask file for openai models', async () => {
      const adapter = new TestLovableImageAdapter(
        { apiKey: 'test-api-key' },
        'openai/gpt-image-2',
      )
      const editSpy = adapter
        .spyOnImagesEdit()
        .mockResolvedValueOnce(imagesEditResponse)

      await adapter.generateImages({
        model: 'openai/gpt-image-2',
        prompt: [
          { type: 'text', content: 'Remove the background' },
          {
            type: 'image',
            source: {
              type: 'data',
              value: 'aGVsbG8=',
              mimeType: 'image/png',
            },
          },
          {
            type: 'image',
            source: {
              type: 'data',
              value: 'bWFzaw==',
              mimeType: 'image/png',
            },
            metadata: { role: 'mask' },
          },
        ],
        logger: testLogger,
      })

      expect(editSpy.mock.calls[0]![0].mask).toBeInstanceOf(File)
    })

    it('rejects mask parts on google image models', async () => {
      const adapter = new TestLovableImageAdapter(
        { apiKey: 'test-api-key' },
        'google/gemini-3.1-flash-image',
      )
      const editSpy = adapter.spyOnImagesEdit()

      await expect(
        adapter.generateImages({
          model: 'google/gemini-3.1-flash-image',
          prompt: [
            { type: 'text', content: 'Remove the background' },
            {
              type: 'image',
              source: {
                type: 'data',
                value: 'aGVsbG8=',
                mimeType: 'image/png',
              },
            },
            {
              type: 'image',
              source: {
                type: 'data',
                value: 'bWFzaw==',
                mimeType: 'image/png',
              },
              metadata: { role: 'mask' },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/does not support mask/)
      expect(editSpy).not.toHaveBeenCalled()
    })

    it('throws on an HTTP(S) URL image input by default', async () => {
      const adapter = new TestLovableImageAdapter(
        { apiKey: 'test-api-key' },
        'openai/gpt-image-2',
      )
      const editSpy = adapter.spyOnImagesEdit()

      await expect(
        adapter.generateImages({
          model: 'openai/gpt-image-2',
          prompt: [
            { type: 'text', content: 'Make it cinematic' },
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/photo.jpg' },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/allowUrlFetch/)
      expect(editSpy).not.toHaveBeenCalled()
    })
  })
})
