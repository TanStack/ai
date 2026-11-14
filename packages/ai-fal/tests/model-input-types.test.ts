import { describe, expectTypeOf, it } from 'vitest'
import type { FalModelInput } from '../src/model-meta'

describe('FalModelInput', () => {
  it('lets *_url fields take a Blob for the client to upload', () => {
    expectTypeOf<FalModelInput<'fal-ai/whisper'>['audio_url']>().toEqualTypeOf<
      string | Blob
    >()
  })
})
