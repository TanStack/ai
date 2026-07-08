import { describe, expect, it, vi } from 'vitest'
import { byokFetch, byokHeaders, byokHeaderName, withByok } from '../src/index'
import type { Keyring } from '../src/index'
import {
  byokMissing,
  getByokKey,
  isByokMissingBody,
  maskKey,
  scrubSecrets,
} from '../src/server'
import { memoryStorage } from '../src/client/storage'
import {
  decryptKeyring,
  deriveAesKey,
  encryptKeyring,
} from '../src/client/passkey'

describe('byokHeaders', () => {
  it('emits one header per present provider and skips empty keys', () => {
    const headers = byokHeaders({
      openai: 'sk-abc',
      anthropic: '',
      gemini: 'g-1',
    })
    expect(headers).toEqual({
      'x-byok-openai': 'sk-abc',
      'x-byok-gemini': 'g-1',
    })
  })
})

describe('withByok / byokFetch', () => {
  it('withByok attaches BYOK headers read fresh at request time', () => {
    let keys: Keyring = { openai: 'sk-a' }
    const build = withByok(() => keys)
    expect(build().headers).toEqual({ 'x-byok-openai': 'sk-a' })
    keys = { openai: 'sk-b', gemini: 'g-1' }
    expect(build().headers).toEqual({
      'x-byok-openai': 'sk-b',
      'x-byok-gemini': 'g-1',
    })
  })

  it('byokFetch fires onMissingKey with the provider on a byokMissing 401', async () => {
    const onMissingKey = vi.fn()
    const fetchImpl = vi.fn(async () => byokMissing('anthropic'))
    const wrapped = byokFetch(onMissingKey, fetchImpl)
    await wrapped('https://x.test')
    expect(onMissingKey).toHaveBeenCalledWith('anthropic')
  })

  it('byokFetch ignores non-401 and non-byok responses', async () => {
    const onMissingKey = vi.fn()
    const wrapped = byokFetch(
      onMissingKey,
      async () => new Response('ok', { status: 200 }),
    )
    await wrapped('https://x.test')
    expect(onMissingKey).not.toHaveBeenCalled()
  })
})

describe('getByokKey', () => {
  it('reads the key from the header, returns null when absent', () => {
    const request = new Request('https://x.test', {
      headers: { [byokHeaderName('openai')]: 'sk-live' },
    })
    expect(getByokKey(request, 'openai')).toBe('sk-live')
    expect(getByokKey(request, 'anthropic')).toBeNull()
  })
})

describe('byokMissing', () => {
  it('returns a typed 401 the client can detect', async () => {
    const response = byokMissing('openai')
    expect(response.status).toBe(401)
    const body: unknown = await response.json()
    expect(isByokMissingBody(body)).toBe(true)
    if (isByokMissingBody(body)) {
      expect(body.error.provider).toBe('openai')
    }
  })
})

describe('scrub', () => {
  it('masks a key down to the last 4 and redacts occurrences', () => {
    expect(maskKey('sk-supersecret1234')).toBe('…1234')
    expect(
      scrubSecrets('failed with sk-supersecret1234!', ['sk-supersecret1234']),
    ).toBe('failed with …1234!')
  })
})

describe('memory storage', () => {
  it('persists nothing', () => {
    const store = memoryStorage()
    store.save({ openai: 'sk-1' })
    expect(store.load()).toEqual({})
    expect(store.persistent).toBe(false)
  })
})

describe('passkey crypto', () => {
  // The WebAuthn ceremony can't run in jsdom, but the PRF → AES-GCM path can:
  // derive a key from a fixed 32-byte "PRF output" and round-trip a keyring.
  const prf = new Uint8Array(32).fill(7)

  it('round-trips a keyring through AES-256-GCM', async () => {
    const key = await deriveAesKey(prf)
    const { iv, ciphertext } = await encryptKeyring(key, {
      openai: 'sk-secret',
    })
    expect(await decryptKeyring(key, iv, ciphertext)).toEqual({
      openai: 'sk-secret',
    })
  })

  it('fails to decrypt with a key derived from a different PRF output', async () => {
    const key = await deriveAesKey(prf)
    const { iv, ciphertext } = await encryptKeyring(key, {
      openai: 'sk-secret',
    })
    const wrongKey = await deriveAesKey(new Uint8Array(32).fill(9))
    await expect(decryptKeyring(wrongKey, iv, ciphertext)).rejects.toThrow()
  })
})
