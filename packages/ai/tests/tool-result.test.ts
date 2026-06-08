import { describe, it, expect } from 'vitest'
import {
  isContentPart,
  isContentPartArray,
  normalizeToolResult,
} from '../src/utilities/tool-result'
import type { ContentPart } from '../src/types'

const image: ContentPart = {
  type: 'image',
  source: { type: 'url', value: 'https://example.com/a.png' },
}
const text: ContentPart = { type: 'text', content: 'hello' }

describe('isContentPart', () => {
  it('accepts valid text and media parts', () => {
    expect(isContentPart(text)).toBe(true)
    expect(isContentPart(image)).toBe(true)
    expect(
      isContentPart({
        type: 'image',
        source: { type: 'data', value: 'AAAA', mimeType: 'image/png' },
      }),
    ).toBe(true)
  })

  it('rejects non-parts', () => {
    expect(isContentPart(null)).toBe(false)
    expect(isContentPart('hi')).toBe(false)
    expect(isContentPart({ type: 'text' })).toBe(false)
    expect(isContentPart({ type: 'image' })).toBe(false)
    expect(isContentPart({ type: 'image', source: {} })).toBe(false)
    expect(isContentPart({ type: 'bogus', content: 'x' })).toBe(false)
  })
})

describe('isContentPartArray', () => {
  it('accepts a non-empty array of valid parts', () => {
    expect(isContentPartArray([text, image])).toBe(true)
    expect(isContentPartArray([text])).toBe(true)
  })

  it('rejects empty / mixed / non-arrays', () => {
    expect(isContentPartArray([])).toBe(false)
    expect(isContentPartArray([text, { foo: 1 }])).toBe(false)
    expect(isContentPartArray([1, 2, 3])).toBe(false)
    expect(isContentPartArray('hello')).toBe(false)
    expect(isContentPartArray({ type: 'text', content: 'x' })).toBe(false)
  })
})

describe('normalizeToolResult', () => {
  it('passes strings through unchanged', () => {
    expect(normalizeToolResult('done')).toBe('done')
  })

  it('passes content-part arrays through unchanged', () => {
    const arr = [text, image]
    expect(normalizeToolResult(arr)).toBe(arr)
  })

  it('stringifies everything else', () => {
    expect(normalizeToolResult({ ok: true })).toBe('{"ok":true}')
    expect(normalizeToolResult([1, 2, 3])).toBe('[1,2,3]')
    expect(normalizeToolResult([])).toBe('[]')
  })
})
