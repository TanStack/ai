import { describe, expectTypeOf, it } from 'vitest'

import { useAudioRecorder, useGeneration } from '../src/index'
import type { UseGenerationReturn } from '../src/index'

/**
 * These lock in two divergences from `@tanstack/ai-react` where this binding
 * deliberately types more precisely than upstream. Both are documented in
 * status.json. If a future parity pass re-widens either signature, these fail.
 */
describe('useGeneration', () => {
  type CustomInput = { prompt: string; steps: number }

  it('types generate() with TInput rather than Record<string, any>', () => {
    const check = () => {
      const { generate } = useGeneration<CustomInput, { url: string }>({
        connection: { connect: async function* () {} },
      })

      expectTypeOf(generate).parameter(0).toEqualTypeOf<CustomInput>()

      void generate({ prompt: 'a guitar', steps: 4 })

      // @ts-expect-error - `steps` is required by CustomInput
      void generate({ prompt: 'a guitar' })

      // @ts-expect-error - `steps` must be a number
      void generate({ prompt: 'a guitar', steps: 'four' })

      // @ts-expect-error - unknown keys are not part of CustomInput
      void generate({ prompt: 'a guitar', steps: 4, seed: 1 })
    }
    void check
  })

  it('carries TInput through the exported return type', () => {
    expectTypeOf<
      UseGenerationReturn<CustomInput, { url: string }>['generate']
    >()
      .parameter(0)
      .toEqualTypeOf<CustomInput>()
  })
})

describe('useAudioRecorder', () => {
  it('keeps AudioRecording when options carry no onComplete', () => {
    const check = () => {
      // Only an unrelated option: this must select the untransformed overload
      // rather than inferring `TOnComplete` as `unknown` and collapsing
      // `recording`/`stop()` to `unknown`.
      const { recording, stop } = useAudioRecorder({
        onError: (_error: Error) => {},
      })

      expectTypeOf(recording).not.toBeUnknown()
      expectTypeOf(recording).not.toBeNull()
      expectTypeOf(stop).returns.not.toBeUnknown()

      // The `.part` accessor only exists if the AudioRecording type survived.
      if (recording) {
        expectTypeOf(recording.base64).toBeString()
      }
    }
    void check
  })

  it('still infers the transform when onComplete is supplied', () => {
    const check = () => {
      const { recording, stop } = useAudioRecorder({
        onComplete: () => 42,
      })

      expectTypeOf(recording).toEqualTypeOf<number | null>()
      expectTypeOf(stop).returns.toEqualTypeOf<Promise<number>>()
    }
    void check
  })

  it('takes no options at all', () => {
    const check = () => {
      const { recording } = useAudioRecorder()
      if (recording) {
        expectTypeOf(recording.base64).toBeString()
      }
    }
    void check
  })
})
