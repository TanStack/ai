import { describe, expect, it } from 'vitest'
import { isJsdoc } from './oxlint-max-comment-lines.js'

describe('comment-limits JSDoc skip', () => {
  it('treats a Block starting with * as JSDoc', () => {
    expect(
      isJsdoc({ type: 'Block', value: '* Convert a tool to OpenAI format.' }),
    ).toBe(true)
    expect(
      isJsdoc({
        type: 'Block',
        value: '*\n * Multi-line JSDoc.\n * @param schema\n',
      }),
    ).toBe(true)
  })

  it('does not treat a plain block comment as JSDoc', () => {
    expect(isJsdoc({ type: 'Block', value: ' leftover debug note ' })).toBe(
      false,
    )
  })

  it('does not treat line comments as JSDoc', () => {
    expect(isJsdoc({ type: 'Line', value: '* not jsdoc' })).toBe(false)
  })
})
