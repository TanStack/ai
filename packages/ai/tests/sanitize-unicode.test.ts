import { describe, expect, it } from 'vitest'
import {
  sanitizeJsonArguments,
  sanitizeUnicode,
} from '../src/utilities/sanitize-unicode'

describe('Unicode sanitation', () => {
  it('removes lone surrogates and preserves pairs', () => {
    expect(sanitizeUnicode('a\ud800b\udc00c😀\ud800\ud800\udc00')).toBe(
      'abc😀𐀀',
    )
  })
  it('keeps valid JSON bytes, spaces, escapes and number spelling', () => {
    const input = ' { "text": "\\uD83D\\uDE00", "n": 1.00 } '
    expect(sanitizeJsonArguments(input)).toBe(input)
  })
  it('sanitizes escaped nested strings after decoding', () => {
    const input = '{"nested":[{"text":"a\\ud800b"}],"pair":"\\ud83d\\ude00"}'
    expect(JSON.parse(sanitizeJsonArguments(input))).toEqual({
      nested: [{ text: 'ab' }],
      pair: '😀',
    })
  })
  it('leaves malformed or incomplete JSON available to its original parser', () => {
    expect(sanitizeJsonArguments('{"text":')).toBe('{"text":')
  })
  it('preserves unrelated numeric bytes when a string needs cleaning', () => {
    expect(
      sanitizeJsonArguments(
        '{"n":9007199254740993,"huge":1e999,"s":"\\ud800"}',
      ),
    ).toBe('{"n":9007199254740993,"huge":1e999,"s":""}')
  })
})
