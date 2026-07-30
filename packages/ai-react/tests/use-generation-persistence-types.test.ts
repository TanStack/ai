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
import { useGenerateImage } from '../src/use-generate-image'
import { useGenerateVideo } from '../src/use-generate-video'
import { useGeneration } from '../src/use-generation'
import { useSummarize } from '../src/use-summarize'
import { useTranscription } from '../src/use-transcription'

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
    }
    void _typeCheck
  })

  it('accepts persistence when a threadId is supplied', () => {
    // Type-level only: never invoked, so no renderer is needed.
    const _typeCheck = () => {
      useGenerateImage({ connection, persistence: true, threadId: 'hero' })
      useGeneration({ connection, persistence: true, threadId: 'hero' })
    }
    void _typeCheck
  })

  it('leaves threadId optional for ephemeral generations', () => {
    // Type-level only: never invoked, so no renderer is needed.
    const _typeCheck = () => {
      // The published no-persistence signature must keep compiling untouched —
      // adding a required option would break every existing call site.
      useGenerateImage({ connection })
      useGenerateImage({ connection, persistence: false })
      useGeneration({ connection })
      useGeneration({ connection, persistence: false })
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
})
