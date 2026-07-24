/**
 * Tests for generateImage's `previousImage` sugar: previously generated images
 * are normalized and prepended to the prompt as image parts, and the option
 * itself never leaks into the adapter's options.
 */
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { generateImage } from '../src/activities/generateImage'
import { BaseImageAdapter } from '../src/activities/generateImage/adapter'
import { generatedImageToImagePart } from '../src/utilities/media-prompt'
import type { ImageActivityOptions } from '../src/activities/generateImage'
import type {
  ImageGenerationOptions,
  ImageGenerationResult,
  MediaPromptPart,
} from '../src/types'

function mockImageAdapter() {
  const generateImages = vi.fn(async (options: ImageGenerationOptions) => ({
    id: 'img-1',
    model: options.model,
    images: [{ url: 'https://example.com/out.png' }],
  }))
  const adapter = {
    kind: 'image' as const,
    name: 'mock',
    model: 'mock-image-model',
    generateImages,
  }
  return { adapter, generateImages }
}

function partsOf(call: ImageGenerationOptions): Array<MediaPromptPart> {
  return call.prompt as Array<MediaPromptPart>
}

describe('generateImage previousImage', () => {
  it('prepends a single GeneratedImage as an image part before the prompt', async () => {
    const { adapter, generateImages } = mockImageAdapter()

    await generateImage({
      adapter: adapter as any,
      prompt: 'make it night time',
      previousImage: { url: 'https://example.com/v1.png' },
    })

    const options = generateImages.mock.calls[0]![0]
    expect(partsOf(options)).toEqual([
      {
        type: 'image',
        source: { type: 'url', value: 'https://example.com/v1.png' },
      },
      { type: 'text', content: 'make it night time' },
    ])
    expect('previousImage' in options).toBe(false)
  })

  it('accepts an array and the whole prior result, preserving order', async () => {
    const { adapter, generateImages } = mockImageAdapter()

    await generateImage({
      adapter: adapter as any,
      prompt: 'blend these',
      previousImage: [
        { url: 'https://example.com/a.png' },
        { url: 'https://example.com/b.png' },
      ],
    })

    await generateImage({
      adapter: adapter as any,
      prompt: 'refine',
      previousImage: {
        images: [{ url: 'https://example.com/c.png' }],
      },
    })

    const first = partsOf(generateImages.mock.calls[0]![0])
    expect(first.map((p) => p.type)).toEqual(['image', 'image', 'text'])
    const second = partsOf(generateImages.mock.calls[1]![0])
    expect(second[0]).toEqual({
      type: 'image',
      source: { type: 'url', value: 'https://example.com/c.png' },
    })
  })

  it('prepends to an existing parts-array prompt', async () => {
    const { adapter, generateImages } = mockImageAdapter()

    await generateImage({
      adapter: adapter as any,
      prompt: [
        { type: 'text', content: 'use the attached style' },
        {
          type: 'image',
          source: { type: 'url', value: 'https://example.com/style.png' },
          metadata: { role: 'reference' },
        },
      ],
      previousImage: { url: 'https://example.com/v1.png' },
    })

    const parts = partsOf(generateImages.mock.calls[0]![0])
    expect(parts).toHaveLength(3)
    expect(parts[0]).toEqual({
      type: 'image',
      source: { type: 'url', value: 'https://example.com/v1.png' },
    })
    expect(parts[1]?.type).toBe('text')
  })

  it('throws when previousImage contains no images', async () => {
    const { adapter, generateImages } = mockImageAdapter()

    await expect(
      generateImage({
        adapter: adapter as any,
        prompt: 'x',
        previousImage: { images: [] },
      }),
    ).rejects.toThrow(/previousImage contained no images/)
    expect(generateImages).not.toHaveBeenCalled()
  })
})

describe('generatedImageToImagePart', () => {
  it('passes remote URLs through as url sources', () => {
    expect(
      generatedImageToImagePart({ url: 'https://example.com/v1.png' }),
    ).toEqual({
      type: 'image',
      source: { type: 'url', value: 'https://example.com/v1.png' },
    })
  })

  it('decomposes data: URLs into data sources', () => {
    expect(
      generatedImageToImagePart({ url: 'data:image/jpeg;base64,/9j/AAA=' }),
    ).toEqual({
      type: 'image',
      source: { type: 'data', value: '/9j/AAA=', mimeType: 'image/jpeg' },
    })
  })

  it('throws on a data: URL without a mime type', () => {
    expect(() => generatedImageToImagePart({ url: 'data:,hello' })).toThrow(
      /missing a mime type/,
    )
  })

  it('sniffs the mime type of b64Json payloads from magic bytes', () => {
    expect(generatedImageToImagePart({ b64Json: 'iVBORw0KGgoAAA' })).toEqual({
      type: 'image',
      source: { type: 'data', value: 'iVBORw0KGgoAAA', mimeType: 'image/png' },
    })
    expect(
      generatedImageToImagePart({ b64Json: '/9j/4AAQSkZJRg' }).source,
    ).toMatchObject({ mimeType: 'image/jpeg' })
    // Unknown payloads default to png.
    expect(generatedImageToImagePart({ b64Json: 'AAAA' }).source).toMatchObject(
      { mimeType: 'image/png' },
    )
  })
})

// ===========================
// Compile-time typing
// ===========================

type MockEditModel = 'edit-capable' | 'text-only'

type MockEditModelSizeByName = {
  'edit-capable': '1024x1024'
  'text-only': '1024x1024'
}

type MockEditModelInputModalitiesByName = {
  'edit-capable': readonly ['image']
  'text-only': readonly []
}

class MockEditImageAdapter<
  TModel extends MockEditModel,
> extends BaseImageAdapter<
  TModel,
  Record<string, unknown>,
  Record<TModel, Record<string, unknown>>,
  MockEditModelSizeByName,
  MockEditModelInputModalitiesByName
> {
  override readonly kind = 'image' as const
  readonly name = 'mock' as const

  generateImages = async (): Promise<ImageGenerationResult> => {
    return { id: 'mock-id', model: this.model, images: [] }
  }
}

describe('previousImage per-model typing', () => {
  it('offers previousImage only for models that accept image inputs', () => {
    type EditCapable = ImageActivityOptions<
      MockEditImageAdapter<'edit-capable'>
    >['previousImage']
    type TextOnly = ImageActivityOptions<
      MockEditImageAdapter<'text-only'>
    >['previousImage']

    expectTypeOf<{ url: string }>().toExtend<NonNullable<EditCapable>>()
    expectTypeOf<TextOnly>().toEqualTypeOf<undefined>()
  })
})
