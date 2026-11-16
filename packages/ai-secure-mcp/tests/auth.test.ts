import { describe, expect, it } from 'vitest'
import { SecureMcpError } from '../src/types'
import { bearerToken, constantTimeEqual, hashToken, verifyToken } from '../src/auth'
import type { ClientRecord } from '../src/types'

const client: ClientRecord = {
  id: 'alice',
  tokenHash: hashToken('secret-token'),
  scopes: ['read'],
}

describe('hashToken', () => {
  it('is a 64-char hex digest and is stable', () => {
    const h = hashToken('secret-token')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).toBe(hashToken('secret-token'))
  })

  it('differs for a different token', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'))
  })
})

describe('constantTimeEqual', () => {
  it('matches equal strings and rejects others', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true)
    expect(constantTimeEqual('abc', 'abd')).toBe(false)
    expect(constantTimeEqual('abc', 'abcd')).toBe(false)
  })
})

describe('bearerToken', () => {
  it('reads a Bearer token and ignores other shapes', () => {
    expect(bearerToken('Bearer xyz')).toBe('xyz')
    expect(bearerToken(' Bearer  xyz ')).toBe(' xyz')
    expect(bearerToken('Basic xyz')).toBeUndefined()
    expect(bearerToken(null)).toBeUndefined()
  })
})

describe('verifyToken', () => {
  it('returns the matching client', () => {
    expect(verifyToken('secret-token', [client], 0).id).toBe('alice')
  })

  it('throws auth_failure for an unknown token', () => {
    expect(() => verifyToken('nope', [client], 0)).toThrow(SecureMcpError)
    try {
      verifyToken('nope', [client], 0)
    } catch (error) {
      expect((error as SecureMcpError).code).toBe('auth_failure')
    }
  })

  it('throws auth_failure for an expired token', () => {
    const expiring: ClientRecord = { ...client, expiresAt: 100 }
    expect(verifyToken('secret-token', [expiring], 50).id).toBe('alice')
    expect(() => verifyToken('secret-token', [expiring], 100)).toThrow(
      /expired/,
    )
  })
})
