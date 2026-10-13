import { describe, expect, it } from 'vitest'
import { scrubSecrets } from '../src'

describe('scrubSecrets', () => {
  it('removes known secrets from text', () => {
    expect(scrubSecrets('token gh-abcdef1234 failed', ['gh-abcdef1234'])).toBe(
      'token [redacted] failed',
    )
  })
})
