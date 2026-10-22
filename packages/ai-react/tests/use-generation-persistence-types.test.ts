/**
 * Type-level tests for the `persistence` / `threadId` pairing on the generation
 * hooks. These assertions are pure types — they never invoke the hooks at
 * runtime (which would require a React renderer).
 *
 * Every hook requires a `threadId`: the stable scope runs are filed under.
 * These tests fail the build if a hook makes it optional again.
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
      // @ts-expect-error threadId is required
      useGenerateImage({ connection, persistence: true })
      // @ts-expect-error threadId is required
      useGenerateVideo({ connection, persistence: true })
      // @ts-expect-error threadId is required
      useGeneration({ connection, persistence: true })
      // @ts-expect-error threadId is required
      useSummarize({ connection, persistence: true })
      // @ts-expect-error threadId is required
      useTranscription({ connection, persistence: true })
      // @ts-expect-error threadId is required
      useGenerateAudio({ connection, persistence: true })
      // @ts-expect-error threadId is required
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

  it('requires threadId for ephemeral generations too', () => {
    // Type-level only: never invoked, so no renderer is needed.
    const _typeCheck = () => {
      // @ts-expect-error threadId is required
      useGenerateImage({ connection })
      // @ts-expect-error threadId is required
      useGenerateImage({ connection, persistence: false })
      // @ts-expect-error threadId is required
      useGenerateVideo({ connection })
      // @ts-expect-error threadId is required
      useGeneration({ connection })
      // @ts-expect-error threadId is required
      useSummarize({ connection })
      // @ts-expect-error threadId is required
      useTranscription({ connection })
      // @ts-expect-error threadId is required
      useGenerateAudio({ connection })
      // @ts-expect-error threadId is required
      useGenerateSpeech({ connection })
      useGenerateImage({ connection, threadId: 'hero', persistence: false })
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
