/**
 * Type-level tests for the `persistence` / `threadId` pairing on the generation
 * hooks. These assertions are pure types — they never invoke the hooks at
 * runtime (which would require a React renderer).
 *
 * Turning `persistence` on requires a `threadId`: the stable scope runs are
 * filed under. Without it the client keys on a generated wire id that changes
 * every reload, so nothing restores while orphaned records accumulate — a
 * silent failure the compiler should catch instead.
 *
 * The pairing is expressed as a union (`GenerationPersistenceOptions`)
 * intersected onto each hook's parameter. That makes it FRAGILE in one specific
 * way: applying a plain `Omit` to a union collapses it to a single object type
 * and the requirement silently disappears. These tests exist so that regression
 * fails the build rather than shipping.
 */

import { describe, it } from 'vitest'
import { useGenerateAudio } from '../src/use-generate-audio'
import { useGenerateImage } from '../src/use-generate-image'
import { useGenerateSpeech } from '../src/use-generate-speech'
import { useGenerateVideo } from '../src/use-generate-video'
import { useGeneration } from '../src/use-generation'
import { useSummarize } from '../src/use-summarize'
import { useTranscription } from '../src/use-transcription'
import type { GenerationPersistenceOptions } from '@tanstack/ai-client'
import type { UseGenerateAudioOptions } from '../src/use-generate-audio'
import type { UseGenerateImageOptions } from '../src/use-generate-image'
import type { UseGenerateSpeechOptions } from '../src/use-generate-speech'
import type { UseGenerateVideoOptions } from '../src/use-generate-video'
import type { UseGenerationOptions } from '../src/use-generation'
import type { UseSummarizeOptions } from '../src/use-summarize'
import type { UseTranscriptionOptions } from '../src/use-transcription'

const connection = {} as never

describe('generation persistence requires a threadId', () => {
  it('rejects `persistence: true` without a threadId', () => {
    // Type-level only: never invoked, so no renderer is needed.
    const _typeCheck = () => {
      // @ts-expect-error threadId is required whenever persistence is set
      useGenerateImage({ connection, persistence: true })
      // @ts-expect-error threadId is required whenever persistence is set
      useGenerateVideo({ connection, persistence: true })
      // @ts-expect-error threadId is required whenever persistence is set
      useGeneration({ connection, persistence: true })
      // @ts-expect-error threadId is required whenever persistence is set
      useSummarize({ connection, persistence: true })
      // @ts-expect-error threadId is required whenever persistence is set
      useTranscription({ connection, persistence: true })
      // @ts-expect-error threadId is required whenever persistence is set
      useGenerateAudio({ connection, persistence: true })
      // @ts-expect-error threadId is required whenever persistence is set
      useGenerateSpeech({ connection, persistence: true })
    }
    void _typeCheck
  })

  it('accepts persistence when a threadId is supplied', () => {
    // Type-level only: never invoked, so no renderer is needed.
    const _typeCheck = () => {
      useGenerateImage({ connection, persistence: true, threadId: 'hero' })
      useGenerateVideo({ connection, persistence: true, threadId: 'hero' })
      useGeneration({ connection, persistence: true, threadId: 'hero' })
      useSummarize({ connection, persistence: true, threadId: 'hero' })
      useTranscription({ connection, persistence: true, threadId: 'hero' })
      useGenerateAudio({ connection, persistence: true, threadId: 'hero' })
      useGenerateSpeech({ connection, persistence: true, threadId: 'hero' })
    }
    void _typeCheck
  })

  it('leaves threadId optional for ephemeral generations', () => {
    // Type-level only: never invoked, so no renderer is needed.
    const _typeCheck = () => {
      // The published no-persistence signature must keep compiling untouched.
      // Adding a required option would break every existing call site.
      useGenerateImage({ connection })
      useGenerateImage({ connection, persistence: false })
      useGenerateImage({ connection, threadId: 'hero' })
      useGenerateVideo({ connection })
      useGenerateVideo({ connection, persistence: false })
      useGeneration({ connection })
      useGeneration({ connection, persistence: false })
      useSummarize({ connection })
      useTranscription({ connection })
      useGenerateAudio({ connection })
      useGenerateSpeech({ connection })
    }
    void _typeCheck
  })

  it('still infers the onResult transform through the union', () => {
    // Type-level only: never invoked, so no renderer is needed.
    const _typeCheck = () => {
      // The union is intersected onto the same parameter that infers
      // `TTransformed`; a bad formulation breaks inference before it breaks the
      // requirement, so pin it here too.
      const image = useGenerateImage({
        connection,
        persistence: true,
        threadId: 'hero',
        onResult: (result) => result.images.length,
      })
      const count: number | null = image.result
      void count
    }
    void _typeCheck
  })

  it('does not list `id` on hook parameters. `threadId` is present', () => {
    type ImageOpts = Omit<
      UseGenerateImageOptions,
      'onResult' | 'persistence' | 'threadId'
    > &
      GenerationPersistenceOptions
    type VideoOpts = Omit<
      UseGenerateVideoOptions,
      'onResult' | 'persistence' | 'threadId'
    > &
      GenerationPersistenceOptions
    type GenOpts = Omit<
      UseGenerationOptions<Record<string, unknown>, unknown>,
      'onResult' | 'persistence' | 'threadId'
    > &
      GenerationPersistenceOptions
    type SummarizeOpts = Omit<
      UseSummarizeOptions,
      'onResult' | 'persistence' | 'threadId'
    > &
      GenerationPersistenceOptions
    type TranscribeOpts = Omit<
      UseTranscriptionOptions,
      'onResult' | 'persistence' | 'threadId'
    > &
      GenerationPersistenceOptions
    type AudioOpts = Omit<
      UseGenerateAudioOptions,
      'onResult' | 'persistence' | 'threadId'
    > &
      GenerationPersistenceOptions
    type SpeechOpts = Omit<
      UseGenerateSpeechOptions,
      'onResult' | 'persistence' | 'threadId'
    > &
      GenerationPersistenceOptions
    // @ts-expect-error id is not a generation hook option
    type _ImageId = ImageOpts['id']
    // @ts-expect-error id is not a generation hook option
    type _VideoId = VideoOpts['id']
    // @ts-expect-error id is not a generation hook option
    type _GenId = GenOpts['id']
    // @ts-expect-error id is not a generation hook option
    type _SummarizeId = SummarizeOpts['id']
    // @ts-expect-error id is not a generation hook option
    type _TranscribeId = TranscribeOpts['id']
    // @ts-expect-error id is not a generation hook option
    type _AudioId = AudioOpts['id']
    // @ts-expect-error id is not a generation hook option
    type _SpeechId = SpeechOpts['id']
    const imageThreadId: ImageOpts['threadId'] = 'hero'
    void imageThreadId
  })
})
