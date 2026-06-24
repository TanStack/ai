/**
 * Per-model type-safety for OpenRouter video durations.
 *
 * Asserts the typed-duration contract flows through `generateVideo()`: a
 * concrete per-model adapter satisfies the activity's `TAdapter extends
 * VideoAdapter<...>` bound, `duration` is narrowed to the model's union, and
 * out-of-range literals are rejected.
 *
 * Regression guard: `createVideoJob` is a contravariant function-valued
 * property, so if the activity constraints pin the duration generic to its
 * default (`Record<string, number>`) instead of `any`, no per-model adapter
 * can be passed to `generateVideo` at all. The checks below are compile-only —
 * the inner closures are typechecked but never invoked (no network).
 */
import { describe, it } from 'vitest'
import { generateVideo } from '@tanstack/ai'
import { openRouterVideo } from '../src'

describe('OpenRouter video duration type-safety', () => {
  it('generateVideo accepts a concrete adapter + snapDuration()', () => {
    const check = () => {
      const adapter = openRouterVideo('bytedance/seedance-2.0') // 4..15
      return generateVideo({
        adapter,
        prompt: 'A timelapse of clouds',
        size: '1280x720',
        duration: adapter.snapDuration(7),
      })
    }
    void check
  })

  it('narrows duration to the model union (rejects out-of-range)', () => {
    const check = () => {
      const adapter = openRouterVideo('google/veo-3.1') // 4 | 6 | 8
      return generateVideo({
        adapter,
        prompt: 'A close-up of a luthier carving a guitar neck',
        // @ts-expect-error 7 is not a valid veo-3.1 duration (4 | 6 | 8)
        duration: 7,
      })
    }
    void check
  })
})
