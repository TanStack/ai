import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  decryptKeyring,
  defaultByokStorage,
  defineByok,
  deriveAesKey,
  encryptKeyring,
  isPasskeyStorageSupported,
  requireUserActivation,
} from '../src/byok'
import type { KeyringStorage } from '../src/byok'

describe('passkey crypto', () => {
  it('round-trips a keyring through AES-256-GCM', async () => {
    const prf = crypto.getRandomValues(new Uint8Array(32))
    const key = await deriveAesKey(prf)
    const keys = { openai: 'sk-abcdefghij' }
    const { iv, ciphertext } = await encryptKeyring(key, keys)
    expect(await decryptKeyring(key, iv, ciphertext)).toEqual(keys)
  })
})

describe('isPasskeyStorageSupported', () => {
  it('returns a boolean', () => {
    expect(typeof isPasskeyStorageSupported()).toBe('boolean')
  })
})

describe('requireUserActivation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('throws when transient activation is gone (avoids a silent get() hang)', () => {
    vi.stubGlobal('navigator', { userActivation: { isActive: false } })
    expect(() => requireUserActivation('unlock')).toThrow(/fresh user action/i)
  })

  it('passes when activation is active or the API is unavailable', () => {
    vi.stubGlobal('navigator', { userActivation: { isActive: true } })
    expect(() => requireUserActivation('unlock')).not.toThrow()
    vi.stubGlobal('navigator', {})
    expect(() => requireUserActivation('unlock')).not.toThrow()
  })
})

describe('defaultByokStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns memory storage with a warning when passkeys are unavailable', () => {
    vi.stubGlobal('PublicKeyCredential', undefined)
    const store = defaultByokStorage()
    expect(store.id).toBe('memory')
    expect(store.warning).toMatch(/memory for this tab only/i)
  })
})

describe('defineByok unlockable storage', () => {
  it('prepare loads the locked keyring before attaching headers', async () => {
    let loadCalls = 0
    const storage: KeyringStorage = {
      id: 'mock-passkey',
      label: 'Mock passkey',
      persistent: true,
      unlockable: true,
      peek: () => ({ openai: 'ghij' }),
      load: () => {
        loadCalls += 1
        return { openai: 'sk-abcdefghij' }
      },
      save: () => {},
      clear: () => {},
    }

    const byok = defineByok({ storage })
    await byok.prepare('openai')

    expect(loadCalls).toBeGreaterThan(0)
    expect(byok.headers('openai')).toEqual({
      'x-byok-openai': 'sk-abcdefghij',
    })
  })
})
