import { describe, expect, it } from 'vitest'
import {
  firstSentence,
  renderLazyCatalogEntry,
  searchLazyTools,
} from '../src/index'

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

describe('searchLazyTools', () => {
  const tools = [
    { name: 'search_inventory', description: 'Search the guitar inventory.' },
    { name: 'checkStock', description: 'Check stock level for a guitar.' },
    { name: 'send_email', description: 'Send an email.' },
  ]

  it('ranks tools by how many query words they match', () => {
    expect(
      searchLazyTools(tools, 'check guitar stock').map((t) => t.name),
    ).toEqual(['checkStock', 'search_inventory'])
  })
  it('splits names at underscores and camelCase', () => {
    expect(searchLazyTools(tools, 'email').map((t) => t.name)).toEqual([
      'send_email',
    ])
    expect(searchLazyTools(tools, 'STOCK').map((t) => t.name)).toEqual([
      'checkStock',
    ])
  })
  it('returns nothing when no word matches', () => {
    expect(searchLazyTools(tools, 'weather')).toEqual([])
  })
  it('returns at most `limit` tools', () => {
    expect(searchLazyTools(tools, 'guitar', 1)).toHaveLength(1)
  })
  it('matches Unicode letters in a query and description', () => {
    expect(
      searchLazyTools(
        [{ name: 'weather', description: 'Прогноз погоды' }],
        'погоды',
      ).map((t) => t.name),
    ).toEqual(['weather'])
  })
})
