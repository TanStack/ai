import { describe, expect, it } from 'vitest'
import {
  toApiSeconds,
  validateVideoSeconds,
  validateVideoSize,
} from '../src/video/video-provider-options'

describe('video provider option validation', () => {
  it('throws for unknown models', () => {
    expect(() => validateVideoSize('not-a-real-model', '1280x720')).toThrow(
      'Unknown video model: not-a-real-model',
    )
    expect(() => validateVideoSeconds('not-a-real-model', '4')).toThrow(
      'Unknown video model: not-a-real-model',
    )
  })

  it('accepts valid values for known models', () => {
    expect(() => validateVideoSize('sora-2', '1280x720')).not.toThrow()
    expect(() => validateVideoSeconds('sora-2', 8)).not.toThrow()
    expect(() => validateVideoSeconds('sora-2-pro', '12')).not.toThrow()
  })

  it('rejects invalid values for known models', () => {
    expect(() => validateVideoSize('sora-2', '1024x1024')).toThrow(
      'Size "1024x1024" is not supported by model "sora-2".',
    )
    expect(() => validateVideoSeconds('sora-2', 6)).toThrow(
      'Duration "6" is not supported by model "sora-2".',
    )
  })

  it('normalizes numeric durations to API strings', () => {
    expect(toApiSeconds(8)).toBe('8')
    expect(toApiSeconds('12')).toBe('12')
    expect(toApiSeconds(undefined)).toBeUndefined()
  })
})
