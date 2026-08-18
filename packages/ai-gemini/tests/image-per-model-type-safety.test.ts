/**
 * Per-model type-safety tests for Gemini `generateImage()` sizes.
 *
 * Positive cases: each documented (model, size) pair compiles cleanly.
 * Negative cases: each undocumented pair produces a `@ts-expect-error`. `tsc`
 * errors on an *unused* `@ts-expect-error`, so a green typecheck is itself the
 * proof that every negative below is genuinely rejected.
 *
 * Companion to `chat-per-model-type-safety.test.ts` (modelOptions) and
 * `tools-per-model-type-safety.test.ts` (tools). Compile-time only —
 * `createImageOptions` is the identity helper for `generateImage()` options,
 * so nothing here touches the network.
 */
import { describe, expectTypeOf, it } from 'vitest'
import { createImageOptions } from '@tanstack/ai'
import { createGeminiImage } from '../src/adapters/image'
import type { GeminiImageModelSizeByName } from '../src/image/image-provider-options'

const apiKey = 'test-api-key'

describe('Gemini per-model image size gating', () => {
  describe('gemini-3.1-flash-image — 14 ratios × 512/1K/2K/4K', () => {
    it('accepts the extreme banner ratios and the 512 tier', () => {
      createImageOptions({
        adapter: createGeminiImage('gemini-3.1-flash-image', apiKey),
        prompt: 'a wide banner',
        size: '1:8_512',
      })
      createImageOptions({
        adapter: createGeminiImage('gemini-3.1-flash-image', apiKey),
        prompt: 'a wide banner',
        size: '8:1_4K',
      })
    })

    it('accepts the flexible 4:5 / 5:4 ratios', () => {
      createImageOptions({
        adapter: createGeminiImage('gemini-3.1-flash-image', apiKey),
        prompt: 'a portrait',
        size: '4:5_1K',
      })
      createImageOptions({
        adapter: createGeminiImage('gemini-3.1-flash-image', apiKey),
        prompt: 'a landscape',
        size: '5:4_2K',
      })
    })

    it('rejects the Cloud-only 9:21 ratio and lowercase resolutions', () => {
      createImageOptions({
        adapter: createGeminiImage('gemini-3.1-flash-image', apiKey),
        prompt: 'a tall strip',
        // @ts-expect-error - 9:21 exists on Vertex/Cloud only; the Gemini API rejects it
        size: '9:21_1K',
      })
      createImageOptions({
        adapter: createGeminiImage('gemini-3.1-flash-image', apiKey),
        prompt: 'a square',
        // @ts-expect-error - the K is case-sensitive; "1k" is rejected by the API
        size: '1:1_1k',
      })
    })

    it('applies the same set to the shut-down -preview alias', () => {
      createImageOptions({
        adapter: createGeminiImage('gemini-3.1-flash-image-preview', apiKey),
        prompt: 'a wide banner',
        size: '1:8_512',
      })
    })
  })

  describe('gemini-3.1-flash-lite-image — 14 ratios, 1K only', () => {
    it('accepts 1K at any of the 14 ratios', () => {
      createImageOptions({
        adapter: createGeminiImage('gemini-3.1-flash-lite-image', apiKey),
        prompt: 'a square',
        size: '1:1_1K',
      })
      createImageOptions({
        adapter: createGeminiImage('gemini-3.1-flash-lite-image', apiKey),
        prompt: 'a banner',
        size: '4:1_1K',
      })
    })

    it('rejects every resolution above 1K', () => {
      createImageOptions({
        adapter: createGeminiImage('gemini-3.1-flash-lite-image', apiKey),
        prompt: 'a landscape',
        // @ts-expect-error - Flash Lite Image only supports 1K; 2K/4K are unsupported
        size: '16:9_4K',
      })
      createImageOptions({
        adapter: createGeminiImage('gemini-3.1-flash-lite-image', apiKey),
        prompt: 'a landscape',
        // @ts-expect-error - Flash Lite Image only supports 1K
        size: '16:9_2K',
      })
      createImageOptions({
        adapter: createGeminiImage('gemini-3.1-flash-lite-image', apiKey),
        prompt: 'a landscape',
        // @ts-expect-error - the 512 tier is Gemini 3.1 Flash Image only
        size: '16:9_512',
      })
    })
  })

  describe('gemini-3-pro-image — 10 ratios × 1K/2K/4K', () => {
    it('accepts the flexible 4:5 ratio at 2K', () => {
      createImageOptions({
        adapter: createGeminiImage('gemini-3-pro-image', apiKey),
        prompt: 'a portrait',
        size: '4:5_2K',
      })
    })

    it('rejects the extreme banner ratios', () => {
      createImageOptions({
        adapter: createGeminiImage('gemini-3-pro-image', apiKey),
        prompt: 'a tall strip',
        // @ts-expect-error - 1:8 is Gemini 3.1 Flash Image only; Pro takes the ten standard ratios
        size: '1:8_1K',
      })
      createImageOptions({
        adapter: createGeminiImage('gemini-3-pro-image', apiKey),
        prompt: 'a wide strip',
        // @ts-expect-error - 4:1 is Gemini 3.1 Flash Image only
        size: '4:1_2K',
      })
    })

    it('rejects the 512 tier', () => {
      createImageOptions({
        adapter: createGeminiImage('gemini-3-pro-image', apiKey),
        prompt: 'a square',
        // @ts-expect-error - Pro has no 512 (0.5K) tier
        size: '1:1_512',
      })
    })

    it('applies the same set to the shut-down -preview alias', () => {
      createImageOptions({
        adapter: createGeminiImage('gemini-3-pro-image-preview', apiKey),
        prompt: 'a portrait',
        size: '4:5_2K',
      })
    })
  })

  describe('gemini-2.5-flash-image — bare aspect ratio, no resolution', () => {
    it('accepts a bare ratio', () => {
      createImageOptions({
        adapter: createGeminiImage('gemini-2.5-flash-image', apiKey),
        prompt: 'a landscape',
        size: '16:9',
      })
      createImageOptions({
        adapter: createGeminiImage('gemini-2.5-flash-image', apiKey),
        prompt: 'a portrait',
        size: '4:5',
      })
    })

    it('rejects any resolution suffix', () => {
      createImageOptions({
        adapter: createGeminiImage('gemini-2.5-flash-image', apiKey),
        prompt: 'a landscape',
        // @ts-expect-error - Google documents no image_size for this model
        size: '16:9_2K',
      })
      createImageOptions({
        adapter: createGeminiImage('gemini-2.5-flash-image', apiKey),
        prompt: 'a landscape',
        // @ts-expect-error - Google documents no image_size for this model
        size: '16:9_1K',
      })
    })

    it('rejects the extreme banner ratios', () => {
      createImageOptions({
        adapter: createGeminiImage('gemini-2.5-flash-image', apiKey),
        prompt: 'a wide strip',
        // @ts-expect-error - 8:1 is Gemini 3.1 Flash Image only
        size: '8:1',
      })
    })
  })

  describe('Imagen models keep pixel sizes', () => {
    it('accepts WIDTHxHEIGHT and rejects aspect-ratio sizes', () => {
      createImageOptions({
        adapter: createGeminiImage('imagen-4.0-generate-001', apiKey),
        prompt: 'a cat',
        size: '1024x1024',
      })
      createImageOptions({
        adapter: createGeminiImage('imagen-4.0-generate-001', apiKey),
        prompt: 'a cat',
        // @ts-expect-error - Imagen takes pixel sizes, not aspect-ratio sizes
        size: '16:9_2K',
      })
    })
  })

  describe('Model name type safety', () => {
    it('rejects unknown image model names at the factory', () => {
      // @ts-expect-error - 'gemini-9-pro-image' is not a Gemini image model
      createGeminiImage('gemini-9-pro-image', apiKey)
    })
  })
})

describe('Gemini image size map shape assertions', () => {
  it('maps each GA id to its own size set', () => {
    expectTypeOf<
      GeminiImageModelSizeByName['gemini-3.1-flash-image']
    >().toEqualTypeOf<
      GeminiImageModelSizeByName['gemini-3.1-flash-image-preview']
    >()
    expectTypeOf<
      GeminiImageModelSizeByName['gemini-3-pro-image']
    >().toEqualTypeOf<
      GeminiImageModelSizeByName['gemini-3-pro-image-preview']
    >()
  })

  it('gives the four native models four different size sets', () => {
    expectTypeOf<
      GeminiImageModelSizeByName['gemini-3.1-flash-image']
    >().not.toEqualTypeOf<
      GeminiImageModelSizeByName['gemini-3.1-flash-lite-image']
    >()
    expectTypeOf<
      GeminiImageModelSizeByName['gemini-3-pro-image']
    >().not.toEqualTypeOf<
      GeminiImageModelSizeByName['gemini-2.5-flash-image']
    >()
  })
})
