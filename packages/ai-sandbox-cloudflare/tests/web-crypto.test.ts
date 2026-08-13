/**
 * Truth table for {@link timingSafeBearerEqualWeb}, the Workers-runtime constant-
 * time bearer check. Pure (TextEncoder + XOR loop), no Workers runtime needed.
 */
import { describe, expect, it } from 'vitest'
import { timingSafeBearerEqualWeb } from '../src/web-crypto'

describe('timingSafeBearerEqualWeb', () => {
  it('accepts the exact `Bearer <token>` header', () => {
    expect(
      timingSafeBearerEqualWeb('Bearer secret-token', 'secret-token'),
    ).toBe(true)
  })

  it('rejects a wrong token of the same length', () => {
    expect(timingSafeBearerEqualWeb('Bearer aaaaaa', 'bbbbbb')).toBe(false)
  })

  it('rejects a token of a different length', () => {
    expect(timingSafeBearerEqualWeb('Bearer short', 'longer-token')).toBe(false)
  })

  it('rejects a missing header', () => {
    expect(timingSafeBearerEqualWeb(undefined, 'secret-token')).toBe(false)
  })

  it('rejects a header missing the `Bearer ` scheme', () => {
    expect(timingSafeBearerEqualWeb('secret-token', 'secret-token')).toBe(false)
  })
})
