/**
 * Per-model type-safety tests for Gemini generateImage() modelOptions.
 *
 * Gemini-native image models (generateContent) and Imagen models
 * (generateImages) take different provider-option shapes, so
 * `GeminiImageModelProviderOptionsByName` splits on the model family the same
 * way the size and input-modality maps do. Positive cases compile cleanly;
 * cross-family cases produce a `@ts-expect-error`.
 *
 * Compile-time only — `createImageOptions` builds the typed options object
 * without issuing a request.
 */
import { beforeAll, describe, expectTypeOf, it } from 'vitest'
import { createImageOptions } from '@tanstack/ai'
import { geminiImage } from '../src'
import type { GeminiImageModelProviderOptionsByName } from '../src'

// Set a dummy API key so adapter construction does not throw at runtime.
// These tests only exercise compile-time type gating; no network calls are made.
beforeAll(() => {
  process.env['GOOGLE_API_KEY'] = 'sk-test-dummy'
})

describe('Gemini per-model image modelOptions gating', () => {
  describe('gemini-3.1-flash-image-preview — native (GenerateContentConfig)', () => {
    it('accepts the native option set', () => {
      createImageOptions({
        adapter: geminiImage('gemini-3.1-flash-image-preview'),
        prompt: 'a quiet harbour',
        modelOptions: {
          seed: 7,
          safetySettings: [],
          thinkingConfig: { thinkingBudget: 512 },
          imageConfig: { aspectRatio: '16:9', imageSize: '2K' },
          systemInstruction: 'Always render in watercolor.',
        },
      })
    })

    it('rejects Imagen-only options', () => {
      // The probes are plain values that are structurally valid on
      // GeminiImageProviderOptions (`negativePrompt: string`,
      // `aspectRatio: GeminiAspectRatio`), so the errors below come from the
      // native/Imagen split and nothing else — an enum-typed field such as
      // `personGeneration` would reject a string literal on either shape and
      // would still "pass" with the split reverted.
      createImageOptions({
        adapter: geminiImage('gemini-3.1-flash-image-preview'),
        prompt: 'a quiet harbour',
        modelOptions: {
          // @ts-expect-error - negativePrompt is a GenerateImagesConfig (Imagen) field
          negativePrompt: 'blurry',
        },
      })

      createImageOptions({
        adapter: geminiImage('gemini-3.1-flash-image-preview'),
        prompt: 'a quiet harbour',
        modelOptions: {
          // @ts-expect-error - aspectRatio is Imagen-only; native models use size / imageConfig
          aspectRatio: '16:9',
        },
      })
    })

    it('rejects responseModalities — the adapter owns it', () => {
      createImageOptions({
        adapter: geminiImage('gemini-3.1-flash-image-preview'),
        prompt: 'a quiet harbour',
        modelOptions: {
          // @ts-expect-error - responseModalities is a protected adapter default
          responseModalities: ['TEXT'],
        },
      })
    })
  })

  describe('imagen-4.0-generate-001 — Imagen (GenerateImagesConfig)', () => {
    it('accepts the Imagen option set', () => {
      createImageOptions({
        adapter: geminiImage('imagen-4.0-generate-001'),
        prompt: 'a quiet harbour',
        modelOptions: {
          aspectRatio: '16:9',
          negativePrompt: 'blurry',
          addWatermark: true,
          outputMimeType: 'image/png',
        },
      })
    })

    it('rejects native-only options', () => {
      createImageOptions({
        adapter: geminiImage('imagen-4.0-generate-001'),
        prompt: 'a quiet harbour',
        modelOptions: {
          // @ts-expect-error - safetySettings is a GenerateContentConfig (native) field
          safetySettings: [],
        },
      })
    })
  })
})

describe('Gemini image provider options shape assertions', () => {
  describe('native models take GenerateContentConfig fields', () => {
    type Options =
      GeminiImageModelProviderOptionsByName['gemini-3.1-flash-image-preview']

    it('has safetySettings', () => {
      expectTypeOf<Options>().toHaveProperty('safetySettings')
    })
    it('has thinkingConfig', () => {
      expectTypeOf<Options>().toHaveProperty('thinkingConfig')
    })
    it('has imageConfig', () => {
      expectTypeOf<Options>().toHaveProperty('imageConfig')
    })
    it('has systemInstruction', () => {
      expectTypeOf<Options>().toHaveProperty('systemInstruction')
    })
    it('has seed', () => {
      expectTypeOf<Options>().toHaveProperty('seed')
    })
  })

  describe('Imagen models keep GenerateImagesConfig fields', () => {
    type Options =
      GeminiImageModelProviderOptionsByName['imagen-4.0-generate-001']

    it('has aspectRatio', () => {
      expectTypeOf<Options>().toHaveProperty('aspectRatio')
    })
    it('has personGeneration', () => {
      expectTypeOf<Options>().toHaveProperty('personGeneration')
    })
    it('has negativePrompt', () => {
      expectTypeOf<Options>().toHaveProperty('negativePrompt')
    })
  })

  describe('every native model id resolves to the native shape', () => {
    it('gemini-3.1-flash-lite-image', () => {
      expectTypeOf<
        GeminiImageModelProviderOptionsByName['gemini-3.1-flash-lite-image']
      >().toHaveProperty('imageConfig')
    })
    it('gemini-3-pro-image-preview', () => {
      expectTypeOf<
        GeminiImageModelProviderOptionsByName['gemini-3-pro-image-preview']
      >().toHaveProperty('imageConfig')
    })
    it('gemini-2.5-flash-image', () => {
      expectTypeOf<
        GeminiImageModelProviderOptionsByName['gemini-2.5-flash-image']
      >().toHaveProperty('imageConfig')
    })
  })
})
