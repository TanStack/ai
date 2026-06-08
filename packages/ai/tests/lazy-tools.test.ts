import { describe, it, expect } from 'vitest'
import { firstSentence, renderLazyCatalogEntry } from '../src/index'

describe('firstSentence', () => {
  it('returns the first sentence ending in a period', () => {
    expect(firstSentence('Hello world. Second sentence.')).toBe('Hello world.')
  })
  it('handles ! and ?', () => {
    expect(firstSentence('Is this it? More text.')).toBe('Is this it?')
  })
  it('returns the whole string when there is no terminator', () => {
    expect(firstSentence('No period here')).toBe('No period here')
  })
  it('trims surrounding whitespace', () => {
    expect(firstSentence('  Padded.  Rest. ')).toBe('Padded.')
  })
  it('returns empty string for empty/whitespace input', () => {
    expect(firstSentence('   ')).toBe('')
  })
})

describe('renderLazyCatalogEntry', () => {
  it("returns the bare name when includeDescription is 'none'", () => {
    expect(
      renderLazyCatalogEntry(
        'fetchWeather',
        'Gets weather. Returns temp.',
        'none',
      ),
    ).toBe('fetchWeather')
  })
  it("defaults to 'none' when includeDescription is omitted", () => {
    expect(renderLazyCatalogEntry('fetchWeather', 'Gets weather.')).toBe(
      'fetchWeather',
    )
  })
  it("appends the first sentence for 'first-sentence'", () => {
    expect(
      renderLazyCatalogEntry(
        'fetchWeather',
        'Gets weather. Returns temp.',
        'first-sentence',
      ),
    ).toBe('fetchWeather — Gets weather.')
  })
  it("appends the full description for 'full'", () => {
    expect(
      renderLazyCatalogEntry(
        'fetchWeather',
        'Gets weather. Returns temp.',
        'full',
      ),
    ).toBe('fetchWeather — Gets weather. Returns temp.')
  })
  it('returns the bare name when description is empty even for full', () => {
    expect(renderLazyCatalogEntry('fetchWeather', '', 'full')).toBe(
      'fetchWeather',
    )
  })
})
