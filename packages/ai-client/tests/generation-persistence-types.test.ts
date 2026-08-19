/**
 * Type-level tests for the `persistence` / `threadId` pairing on generation
 * clients. These assertions are pure types. They never construct a client at
 * runtime.
 *
 * Persistence that is on requires a `threadId`. Identity is only `threadId`.
 * There is no instance `id`.
 */

import { describe, it } from 'vitest'
import { GenerationClient } from '../src/generation-client'
import { VideoGenerationClient } from '../src/video-generation-client'
import type {
  GenerationClientOptions,
  VideoGenerationClientOptions,
} from '../src/generation-types'

const connection = {
  async *connect() {},
}

describe('GenerationClient persistence requires a threadId', () => {
  it('rejects persistence: true without a threadId', () => {
    const _typeCheck = () => {
      // @ts-expect-error threadId is required whenever persistence is on
      new GenerationClient({ connection, persistence: true })
      // @ts-expect-error threadId is required whenever persistence is on
      new VideoGenerationClient({ connection, persistence: true })
    }
    void _typeCheck
  })

  it('accepts persistence when a threadId is supplied', () => {
    const _typeCheck = () => {
      new GenerationClient({
        connection,
        persistence: true,
        threadId: 'product-123-hero',
      })
      new VideoGenerationClient({
        connection,
        persistence: true,
        threadId: 'video-9-start-frame',
      })
    }
    void _typeCheck
  })

  it('leaves threadId optional for ephemeral generations', () => {
    const _typeCheck = () => {
      new GenerationClient({ connection })
      new GenerationClient({ connection, persistence: false })
      new GenerationClient({ connection, threadId: 'product-123-hero' })
      new VideoGenerationClient({ connection })
      new VideoGenerationClient({ connection, persistence: false })
    }
    void _typeCheck
  })

  it('rejects `id` next to a required `threadId`', () => {
    const _typeCheck = () => {
      new GenerationClient({
        connection,
        persistence: true,
        threadId: 'product-123-hero',
        // @ts-expect-error id is not a generation option
        id: 'legacy',
      })
      new VideoGenerationClient({
        connection,
        persistence: true,
        threadId: 'video-9-start-frame',
        // @ts-expect-error id is not a generation option
        id: 'legacy',
      })
    }
    void _typeCheck
  })

  it('does not list `id` on generation option types. `threadId` is present', () => {
    type GenOpts = GenerationClientOptions<Record<string, unknown>, unknown>
    // @ts-expect-error id is not a generation option
    type _GenId = GenOpts['id']
    // @ts-expect-error id is not a generation option
    type _VideoId = VideoGenerationClientOptions['id']
    const threadId: GenOpts['threadId'] = 'product-123-hero'
    void threadId
  })
})
