import { MediaModality } from '@google/genai'
import { describe, expect, it } from 'vitest'
import {
  flattenModalityTokenCounts,
  hasModalityTokens,
} from '../src/utils/flatten-modality-tokens'

describe('flattenModalityTokenCounts', () => {
  it('returns empty object for undefined input', () => {
    expect(flattenModalityTokenCounts(undefined)).toEqual({})
  })

  it('returns empty object for empty array', () => {
    expect(flattenModalityTokenCounts([])).toEqual({})
  })

  it('extracts TEXT modality tokens', () => {
    const result = flattenModalityTokenCounts([
      { modality: MediaModality.TEXT, tokenCount: 100 },
    ])
    expect(result).toEqual({ textTokens: 100 })
  })

  it('extracts IMAGE modality tokens', () => {
    const result = flattenModalityTokenCounts([
      { modality: MediaModality.IMAGE, tokenCount: 50 },
    ])
    expect(result).toEqual({ imageTokens: 50 })
  })

  it('extracts AUDIO modality tokens', () => {
    const result = flattenModalityTokenCounts([
      { modality: MediaModality.AUDIO, tokenCount: 200 },
    ])
    expect(result).toEqual({ audioTokens: 200 })
  })

  it('extracts VIDEO modality tokens', () => {
    const result = flattenModalityTokenCounts([
      { modality: MediaModality.VIDEO, tokenCount: 150 },
    ])
    expect(result).toEqual({ videoTokens: 150 })
  })

  it('handles multiple modalities', () => {
    const result = flattenModalityTokenCounts([
      { modality: MediaModality.TEXT, tokenCount: 100 },
      { modality: MediaModality.IMAGE, tokenCount: 50 },
      { modality: MediaModality.AUDIO, tokenCount: 25 },
    ])
    expect(result).toEqual({
      textTokens: 100,
      imageTokens: 50,
      audioTokens: 25,
    })
  })

  it('handles case-insensitive modality names', () => {
    const result = flattenModalityTokenCounts([
      { modality: 'text' as MediaModality, tokenCount: 100 },
      { modality: 'Image' as MediaModality, tokenCount: 50 },
    ])
    expect(result).toEqual({
      textTokens: 100,
      imageTokens: 50,
    })
  })

  it('aggregates duplicate modality entries', () => {
    const result = flattenModalityTokenCounts([
      { modality: MediaModality.TEXT, tokenCount: 100 },
      { modality: MediaModality.TEXT, tokenCount: 50 },
    ])
    expect(result).toEqual({ textTokens: 150 })
  })

  it('ignores unknown modalities', () => {
    const result = flattenModalityTokenCounts([
      { modality: MediaModality.TEXT, tokenCount: 100 },
      { modality: 'UNKNOWN' as MediaModality, tokenCount: 999 },
    ])
    expect(result).toEqual({ textTokens: 100 })
  })

  it('skips entries with undefined modality', () => {
    const result = flattenModalityTokenCounts([
      { modality: undefined, tokenCount: 100 },
      { modality: MediaModality.TEXT, tokenCount: 50 },
    ])
    expect(result).toEqual({ textTokens: 50 })
  })

  it('skips entries with undefined tokenCount', () => {
    const result = flattenModalityTokenCounts([
      { modality: MediaModality.TEXT, tokenCount: undefined },
      { modality: MediaModality.IMAGE, tokenCount: 50 },
    ])
    expect(result).toEqual({ imageTokens: 50 })
  })
})

describe('hasModalityTokens', () => {
  it('returns false for empty object', () => {
    expect(hasModalityTokens({})).toBe(false)
  })

  it('returns true when textTokens is defined', () => {
    expect(hasModalityTokens({ textTokens: 100 })).toBe(true)
  })

  it('returns true when imageTokens is defined', () => {
    expect(hasModalityTokens({ imageTokens: 50 })).toBe(true)
  })

  it('returns true when audioTokens is defined', () => {
    expect(hasModalityTokens({ audioTokens: 25 })).toBe(true)
  })

  it('returns true when videoTokens is defined', () => {
    expect(hasModalityTokens({ videoTokens: 75 })).toBe(true)
  })

  it('returns true when multiple tokens are defined', () => {
    expect(
      hasModalityTokens({
        textTokens: 100,
        imageTokens: 50,
      }),
    ).toBe(true)
  })

  it('returns true when token count is zero', () => {
    expect(hasModalityTokens({ textTokens: 0 })).toBe(true)
  })
})
