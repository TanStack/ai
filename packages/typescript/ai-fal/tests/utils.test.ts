import { describe, expect, it, vi } from 'vitest'
import { fal } from '@fal-ai/client'
import {
  configureFalClient,
  deriveAudioContentType,
  extractUrlExtension,
  generateId,
} from '../src/utils'
import { mapSizeToFalFormat } from '../src/image/image-provider-options'

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
  },
}))

describe('generateId', () => {
  it('returns a suffix with at least 8 characters of entropy', () => {
    // Regression: previously used `.substring(7)` on a ~11-char base36 string,
    // leaving only 4 random chars. Now uses `.substring(2)` to drop the "0."
    // prefix and keep the full random portion.
    for (let i = 0; i < 50; i += 1) {
      const id = generateId('fal')
      const parts = id.split('-')
      const suffix = parts[parts.length - 1]
      expect(suffix).toBeDefined()
      expect(suffix!.length).toBeGreaterThanOrEqual(8)
    }
  })

  it('preserves the provided prefix', () => {
    const id = generateId('my-prefix')
    expect(id.startsWith('my-prefix-')).toBe(true)
  })
})

describe('configureFalClient', () => {
  it('passes both credentials and proxyUrl when both are set', () => {
    const configSpy = vi.mocked(fal.config)
    configSpy.mockClear()

    configureFalClient({ apiKey: 'test-key', proxyUrl: '/api/fal/proxy' })

    expect(configSpy).toHaveBeenCalledWith({
      credentials: 'test-key',
      proxyUrl: '/api/fal/proxy',
    })
  })

  it('passes only credentials when proxyUrl is absent', () => {
    const configSpy = vi.mocked(fal.config)
    configSpy.mockClear()

    configureFalClient({ apiKey: 'test-key' })

    expect(configSpy).toHaveBeenCalledWith({ credentials: 'test-key' })
  })
})

describe('extractUrlExtension', () => {
  it('extracts simple extensions', () => {
    expect(extractUrlExtension('https://x.com/a.mp3')).toBe('mp3')
    expect(extractUrlExtension('https://x.com/a.wav')).toBe('wav')
  })

  it('strips query strings', () => {
    expect(extractUrlExtension('https://x.com/a.mp3?sig=1')).toBe('mp3')
  })

  it('returns undefined for URLs without an extension', () => {
    expect(
      extractUrlExtension('https://x.com/path/no-extension'),
    ).toBeUndefined()
    expect(extractUrlExtension('https://x.com/')).toBeUndefined()
  })

  it('returns undefined when the extension is too long or has weird chars', () => {
    expect(
      extractUrlExtension('https://x.com/a.this-is-not-a-real-ext'),
    ).toBeUndefined()
  })
})

describe('deriveAudioContentType', () => {
  it('prefers the explicit content type (stripped)', () => {
    expect(deriveAudioContentType('audio/wav; codecs=pcm', '')).toBe(
      'audio/wav',
    )
  })

  it('falls back to extension-based mapping', () => {
    expect(deriveAudioContentType(undefined, 'https://x.com/a.mp3')).toBe(
      'audio/mpeg',
    )
    expect(deriveAudioContentType(undefined, 'https://x.com/a.wav')).toBe(
      'audio/wav',
    )
    expect(deriveAudioContentType(undefined, 'https://x.com/a.ogg')).toBe(
      'audio/ogg',
    )
  })

  it('falls back to audio/mpeg when extension is missing', () => {
    expect(deriveAudioContentType(undefined, 'https://x.com/no-ext')).toBe(
      'audio/mpeg',
    )
  })
})

describe('mapSizeToFalFormat', () => {
  it('returns undefined when size is undefined', () => {
    expect(mapSizeToFalFormat(undefined)).toBeUndefined()
  })

  it('emits only aspect_ratio + resolution for aspect-ratio+resolution strings', () => {
    expect(mapSizeToFalFormat('16:9_4K')).toEqual({
      aspect_ratio: '16:9',
      resolution: '4K',
    })
  })

  it('emits only aspect_ratio for bare aspect-ratio strings', () => {
    const result = mapSizeToFalFormat('16:9') as Record<string, unknown>
    expect(result).toEqual({ aspect_ratio: '16:9' })
    // Must not leak undefined properties.
    expect(Object.prototype.hasOwnProperty.call(result, 'resolution')).toBe(
      false,
    )
    expect(Object.prototype.hasOwnProperty.call(result, 'image_size')).toBe(
      false,
    )
  })

  it('emits only image_size for preset strings', () => {
    const result = mapSizeToFalFormat('landscape_4_3') as Record<
      string,
      unknown
    >
    expect(result).toEqual({ image_size: 'landscape_4_3' })
    expect(Object.prototype.hasOwnProperty.call(result, 'aspect_ratio')).toBe(
      false,
    )
  })

  it('never emits aspect_ratio: undefined', () => {
    const result = mapSizeToFalFormat('portrait_16_9') as Record<
      string,
      unknown
    >
    expect(result.aspect_ratio).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(result, 'aspect_ratio')).toBe(
      false,
    )
  })
})
