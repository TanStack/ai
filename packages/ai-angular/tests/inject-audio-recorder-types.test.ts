/**
 * Type-level tests for `injectAudioRecorder` overload selection (issue #1001).
 * Scenario functions are never executed (the injectable requires an injection
 * context at runtime), so `expectTypeOf` runs as a no-op and `tsc`
 * (`test:types`) is what validates them.
 */
import { describe, expectTypeOf, it } from 'vitest'
import { injectAudioRecorder } from '../src/inject-audio-recorder'
import type { AudioRecording } from '@tanstack/ai-client'

describe('injectAudioRecorder type inference (issue #1001)', () => {
  it('keeps AudioRecording when options carry no onComplete', () => {
    function _scenario() {
      // Only an unrelated option: must select the untransformed overload rather
      // than inferring `TOnComplete` as `unknown` and collapsing types.
      const { recording, stop } = injectAudioRecorder({
        onError: (_error: Error) => {},
      })

      expectTypeOf(recording()).not.toBeUnknown()
      expectTypeOf(recording()).toEqualTypeOf<AudioRecording | null>()
      expectTypeOf(stop).returns.toEqualTypeOf<Promise<AudioRecording>>()

      const value = recording()
      if (value) {
        expectTypeOf(value.base64).toBeString()
      }
    }
    void _scenario
  })

  it('re-types stop()/recording() from onComplete', () => {
    function _scenario() {
      const { recording, stop } = injectAudioRecorder({
        onComplete: (rec) => rec.base64,
      })
      expectTypeOf(recording()).toEqualTypeOf<string | null>()
      expectTypeOf(stop).returns.toEqualTypeOf<Promise<string>>()
    }
    void _scenario
  })

  it('keeps AudioRecording when called with no options', () => {
    function _scenario() {
      const { recording, stop } = injectAudioRecorder()
      expectTypeOf(recording()).toEqualTypeOf<AudioRecording | null>()
      expectTypeOf(stop).returns.toEqualTypeOf<Promise<AudioRecording>>()
    }
    void _scenario
  })
})
