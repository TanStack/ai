import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  byokFetch,
  byokFetcher,
  byokHeaders,
  byokHeaderName,
  withByok,
} from '../src/index'
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
  defaultByokStorage,
} from '../src/client/passkey'
import {
  buildOpenRouterAuthUrl,
  clearOpenRouterPkcePending,
  completeOpenRouterPkceFromUrl,
  createS256CodeChallenge,
  exchangeOpenRouterCode,
  generateCodeVerifier,
  loadOpenRouterPkcePending,
  storeOpenRouterPkcePending,
} from '../src/client/openrouter-pkce'

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

describe('byokFetcher', () => {
  it('hands the handler fresh headers and forwards the transport signal', () => {
    let keys: Keyring = { openai: 'sk-a' }
    const handler = vi.fn((_input: { prompt: string }, ctx) => ctx)
    const fetcher = byokFetcher(() => keys, handler)

    const first = fetcher({ prompt: 'hi' })
    expect(first.headers).toEqual({ 'x-byok-openai': 'sk-a' })
    expect(first.fetch).toBe(fetch)
    expect(first.signal).toBeUndefined()

    keys = { openai: 'sk-b', gemini: 'g-1' }
    const controller = new AbortController()
    const second = fetcher({ prompt: 'yo' }, { signal: controller.signal })
    expect(second.headers).toEqual({
      'x-byok-openai': 'sk-b',
      'x-byok-gemini': 'g-1',
    })
    expect(second.signal).toBe(controller.signal)
  })

  it('supplies a missing-key-aware fetch when onMissingKey is set', async () => {
    const onMissingKey = vi.fn()
    const fetchImpl = vi.fn(async () => byokMissing('anthropic'))
    const fetcher = byokFetcher(
      () => ({ anthropic: 'sk-x' }),
      (_input: null, ctx) => ctx.fetch('https://x.test'),
      { onMissingKey, fetchClient: fetchImpl },
    )
    await fetcher(null)
    expect(onMissingKey).toHaveBeenCalledWith('anthropic')
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

describe('defaultByokStorage', () => {
  it('returns passkey or memory storage', () => {
    const store = defaultByokStorage()
    expect(['passkey', 'memory']).toContain(store.id)
  })
})

describe('OpenRouter PKCE', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    storage.clear()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    })
  })

  it('generateCodeVerifier produces URL-safe strings', () => {
    const verifier = generateCodeVerifier(48)
    expect(verifier).toHaveLength(48)
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/)
  })

  it('createS256CodeChallenge is deterministic for a fixed verifier', async () => {
    const challenge = await createS256CodeChallenge('test-verifier-fixed')
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/)
    expect(await createS256CodeChallenge('test-verifier-fixed')).toBe(challenge)
  })

  it('buildOpenRouterAuthUrl encodes callback and S256 challenge', () => {
    const url = buildOpenRouterAuthUrl({
      callbackUrl: 'https://app.test/chat',
      codeChallenge: 'abc123',
      codeChallengeMethod: 'S256',
    })
    expect(url).toContain('https://openrouter.ai/auth?')
    expect(url).toContain('callback_url=https%3A%2F%2Fapp.test%2Fchat')
    expect(url).toContain('code_challenge=abc123')
    expect(url).toContain('code_challenge_method=S256')
  })

  it('exchangeOpenRouterCode posts code and verifier', async () => {
    let postedBody = ''
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      postedBody = String(init?.body ?? '')
      return Response.json({ key: 'sk-or-pkce-key' })
    }) as typeof fetch
    const key = await exchangeOpenRouterCode({
      code: 'auth-code',
      codeVerifier: 'verifier-1',
      codeChallengeMethod: 'S256',
      fetchImpl,
    })
    expect(key).toBe('sk-or-pkce-key')
    expect(JSON.parse(postedBody)).toEqual({
      code: 'auth-code',
      code_verifier: 'verifier-1',
      code_challenge_method: 'S256',
    })
  })

  it('completeOpenRouterPkceFromUrl exchanges when code and pending state exist', async () => {
    storeOpenRouterPkcePending({
      codeVerifier: 'verifier-xyz',
      codeChallengeMethod: 'S256',
      callbackUrl: 'https://app.test/',
    })
    const fetchImpl = vi.fn(async () =>
      Response.json({ key: 'sk-or-returned' }),
    )
    const key = await completeOpenRouterPkceFromUrl({
      url: 'https://app.test/?code=returned-code',
      fetchImpl,
      cleanUrl: false,
    })
    expect(key).toBe('sk-or-returned')
    expect(loadOpenRouterPkcePending()).toBeNull()
    clearOpenRouterPkcePending()
  })
})
