import { describe, expect, it } from 'vitest'
import { normalizeSystemPrompts } from '../src/system-prompts'

describe('normalizeSystemPrompts', () => {
  it('returns an empty array when input is undefined', () => {
    expect(normalizeSystemPrompts(undefined)).toEqual([])
  })

  it('returns an empty array when input is empty', () => {
    expect(normalizeSystemPrompts([])).toEqual([])
  })

  it('wraps plain strings into `{ content }` objects', () => {
    expect(normalizeSystemPrompts(['a', 'b'])).toEqual([
      { content: 'a' },
      { content: 'b' },
    ])
  })

  it('passes object-form entries through unchanged', () => {
    const meta = { cache_control: { type: 'ephemeral' } }
    expect(
      normalizeSystemPrompts([
        { content: 'cached', metadata: meta },
        { content: 'plain' },
      ]),
    ).toEqual([{ content: 'cached', metadata: meta }, { content: 'plain' }])
  })

  it('mixes plain strings and object-form in order', () => {
    expect(
      normalizeSystemPrompts(['first', { content: 'second' }, 'third']),
    ).toEqual([
      { content: 'first' },
      { content: 'second' },
      { content: 'third' },
    ])
  })

  it('throws TypeError naming the offending index when object-form content is not a string', () => {
    expect(() =>
      normalizeSystemPrompts(['ok', { metadata: {} } as any]),
    ).toThrow(/systemPrompts\[1\]: content must be a string, got undefined/)

    expect(() => normalizeSystemPrompts([{ content: 42 as any }])).toThrow(
      /systemPrompts\[0\]: content must be a string, got number/,
    )
  })

  it('throws TypeError when entry is neither string nor object', () => {
    expect(() => normalizeSystemPrompts(['ok', 123 as any])).toThrow(
      /systemPrompts\[1\]: expected a string or .* got number/,
    )

    expect(() => normalizeSystemPrompts([null as any])).toThrow(
      /systemPrompts\[0\]: expected a string or .* got null/,
    )
  })
})
