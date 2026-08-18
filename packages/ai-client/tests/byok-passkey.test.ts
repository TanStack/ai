import { describe, expect, it } from 'vitest'
import {
  decryptKeyring,
  defaultByokStorage,
  defineByok,
  deriveAesKey,
  encryptKeyring,
  isPasskeyStorageSupported,
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

describe('defaultByokStorage', () => {
  it('returns passkey or memory storage', () => {
    const store = defaultByokStorage()
    expect(['passkey', 'memory']).toContain(store.id)
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
