import { describe, expect, it } from 'vitest'
import { toolResultContentToString } from '../src/tool-result-content'

describe('toolResultContentToString', () => {
  it('returns string content unchanged', () => {
    expect(toolResultContentToString('hello world')).toBe('hello world')
  })

  it('returns an empty string unchanged', () => {
    expect(toolResultContentToString('')).toBe('')
  })

  it('concatenates the text parts of array content', () => {
    const content = [
      { type: 'text' as const, content: 'first' },
      { type: 'text' as const, content: 'second' },
    ]
    expect(toolResultContentToString(content)).toBe('firstsecond')
  })

  it('skips non-text parts and keeps surrounding text', () => {
    const content = [
      { type: 'text' as const, content: 'before' },
      {
        type: 'image' as const,
        source: { type: 'url' as const, value: 'https://example.com/x.png' },
      },
      { type: 'text' as const, content: 'after' },
    ]
    expect(toolResultContentToString(content)).toBe('beforeafter')
  })

  it('returns an empty string when array content has no text parts', () => {
    const content = [
      {
        type: 'image' as const,
        source: { type: 'url' as const, value: 'https://example.com/x.png' },
      },
    ]
    expect(toolResultContentToString(content)).toBe('')
  })

  it('returns an empty string for an empty array', () => {
    expect(toolResultContentToString([])).toBe('')
  })
})
