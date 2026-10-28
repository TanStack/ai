import { describe, expect, it } from 'vitest'
import {
  bearer,
  createSecrets,
  isSecretRef,
  resolveBearer,
  resolveSecret,
} from '../src/secrets'

describe('createSecrets', () => {
  it('creates a SecretRef with the correct __secretName', () => {
    const secrets = createSecrets({ GH: 'tok' })
    expect(secrets.GH.__secretName).toBe('GH')
  })

  it('resolveSecret returns the plaintext value', () => {
    const secrets = createSecrets({ GH: 'tok' })
    expect(resolveSecret(secrets, secrets.GH)).toBe('tok')
  })

  it('registry is NOT enumerable on the secrets object', () => {
    const secrets = createSecrets({ GH: 'tok', NPM: 'npmtok' })
    expect(Object.keys(secrets)).toEqual(expect.arrayContaining(['GH', 'NPM']))
    expect(Object.keys(secrets)).not.toContain('__registry')
    expect(Object.keys(secrets).length).toBe(2)
  })

  it('isSecretRef discriminates SecretRef from non-SecretRef values', () => {
    const secrets = createSecrets({ GH: 'tok' })
    expect(isSecretRef(secrets.GH)).toBe(true)
    expect(isSecretRef('plain string')).toBe(false)
    expect(isSecretRef(null)).toBe(false)
    expect(isSecretRef(42)).toBe(false)
    expect(isSecretRef({ __secretName: 'manual' })).toBe(true)
  })

  it('bearer(ref) resolves to "Bearer <value>"', () => {
    const secrets = createSecrets({ GH: 'tok' })
    const ref = bearer(secrets.GH)
    expect(resolveBearer(secrets, ref)).toBe('Bearer tok')
  })

  it('each named property is a frozen object', () => {
    const secrets = createSecrets({ GH: 'tok' })
    expect(Object.isFrozen(secrets.GH)).toBe(true)
  })

  it('resolveSecret throws for an unknown secret name', () => {
    const secrets = createSecrets({ GH: 'tok' })
    const unknownRef = { __secretName: 'UNKNOWN' }
    expect(() => resolveSecret(secrets, unknownRef)).toThrow(
      'resolveSecret: unknown secret "UNKNOWN"',
    )
  })
})
