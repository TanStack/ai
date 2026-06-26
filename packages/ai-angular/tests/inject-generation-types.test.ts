/**
 * Type-level tests for the generation injectables' `onResult` transform
 * inference (issue #848). `TTransformed` infers from the `onResult` return
 * position — a covariant inference site that works even for an optional nested
 * property — which contextually types the callback parameter as the raw result
 * and narrows `result` to the transform's return. (Inferring the whole callback
 * as a defaulted type parameter instead collapses to its default, leaving the
 * parameter `any`.) These are pure compile-time assertions — the scenario
 * functions are never executed (the inject* helpers require an injection
 * context at runtime), so `expectTypeOf` runs as a no-op and `tsc`
 * (`test:types`) is what validates them.
 */

import { describe, expectTypeOf, it } from 'vitest'
import { injectGeneration } from '../src/inject-generation'
import { injectTranscription } from '../src/inject-transcription'
import { injectGenerateSpeech } from '../src/inject-generate-speech'
import type { TTSResult, TranscriptionResult } from '@tanstack/ai'

describe('generation onResult inference (#848)', () => {
  describe('base injectGeneration', () => {
    it('infers TResult from the fetcher and narrows result to the transform return', () => {
      function _scenario() {
        const api = injectGeneration({
          fetcher: async () => ({ id: '1', audio: 'base64data' }),
          onResult: (raw) => ({ playable: raw.audio.length > 0 }),
        })
        // `raw` is contextually typed from the fetcher; `result` narrows to the
        // transform's return type — no explicit type arguments needed.
        expectTypeOf(api.result()).toEqualTypeOf<{ playable: boolean } | null>()
      }
      void _scenario
    })

    it('keeps the raw result type when no onResult is provided', () => {
      function _scenario() {
        const api = injectGeneration({
          fetcher: async () => ({ id: '1', text: 'hi' }),
        })
        expectTypeOf(api.result()).toEqualTypeOf<{
          id: string
          text: string
        } | null>()
      }
      void _scenario
    })

    it('infers TResult from an annotated onResult parameter in connection-only mode', () => {
      function _scenario() {
        type StreamResult = { id: string; images: Array<string> }
        // The connection adapter is untyped, but annotating the `onResult`
        // parameter gives the base hook a site to infer `TResult` from (it
        // appears directly in the callback parameter position) — no explicit
        // type arguments needed.
        const api = injectGeneration({
          connection: undefined as any,
          onResult: (raw: StreamResult) => ({ count: raw.images.length }),
        })
        expectTypeOf(api.result()).toEqualTypeOf<{ count: number } | null>()
      }
      void _scenario
    })
  })

  describe('wrapper hooks', () => {
    it('narrows the wrapper result type to the transform return', () => {
      function _scenario() {
        const api = injectTranscription({
          fetcher: async () => ({ id: '1', text: 'hi', model: 'whisper-1' }),
          onResult: (res) => res.text,
        })
        expectTypeOf(api.result()).toEqualTypeOf<string | null>()
      }
      void _scenario
    })

    it('infers the raw result type when no onResult is provided', () => {
      function _scenario() {
        const api = injectTranscription({
          fetcher: async () => ({ id: '1', text: 'hi', model: 'whisper-1' }),
        })
        expectTypeOf(api.result()).toEqualTypeOf<TranscriptionResult | null>()
      }
      void _scenario
    })

    it('narrows injectGenerateSpeech result to the transform return', () => {
      function _scenario() {
        const mockTTSResult: TTSResult = {
          id: '1',
          model: 'tts-1',
          audio: 'base64audio',
          format: 'mp3',
          contentType: 'audio/mpeg',
        }
        const api = injectGenerateSpeech({
          fetcher: async () => mockTTSResult,
          onResult: (raw) => ({
            audioUrl: `data:${raw.contentType};base64,${raw.audio}`,
          }),
        })
        expectTypeOf(api.result()).toEqualTypeOf<{ audioUrl: string } | null>()
      }
      void _scenario
    })

    it('keeps the raw result type for injectGenerateSpeech without onResult', () => {
      function _scenario() {
        const api = injectGenerateSpeech({
          fetcher: async () => undefined as unknown as TTSResult,
        })
        expectTypeOf(api.result()).toEqualTypeOf<TTSResult | null>()
      }
      void _scenario
    })
  })
})
