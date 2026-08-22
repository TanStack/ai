import { afterEach, describe, expect, it, vi } from 'vitest'
import { openrouterByok } from '../src/byok'
import {
  buildOpenRouterAuthUrl,
  completeOpenRouterPkceFromUrl,
  completeOpenRouterPkceIntoByok,
  createS256CodeChallenge,
  exchangeOpenRouterCode,
  generateCodeVerifier,
  startOpenRouterPkceLogin,
  storeOpenRouterPkcePending,
} from '../src/pkce'

function memorySessionStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => {
      map.clear()
    },
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key)
    },
    setItem: (key, value) => {
      map.set(key, value)
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OpenRouter PKCE', () => {
  it('builds the OpenRouter auth URL with S256', () => {
    const url = buildOpenRouterAuthUrl({
      callbackUrl: 'https://app.example/chat',
      codeChallenge: 'abc',
      codeChallengeMethod: 'S256',
    })
    expect(url).toContain('https://openrouter.ai/auth?')
    expect(url).toContain('callback_url=https%3A%2F%2Fapp.example%2Fchat')
    expect(url).toContain('code_challenge=abc')
    expect(url).toContain('code_challenge_method=S256')
  })

  it('generates a verifier in the RFC 7636 length range', () => {
    const verifier = generateCodeVerifier()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
  })

  it('creates a stable S256 challenge', async () => {
    const first = await createS256CodeChallenge('verifier-one')
    const second = await createS256CodeChallenge('verifier-one')
    expect(first).toBe(second)
    expect(first).not.toContain('+')
    expect(first).not.toContain('/')
    expect(first).not.toContain('=')
  })

  it('redirects to OpenRouter with a stored S256 session', async () => {
    const storage = memorySessionStorage()
    vi.stubGlobal('sessionStorage', storage)
    const navigate = vi.fn()
    await startOpenRouterPkceLogin({
      callbackUrl: 'https://app.example/chat',
      navigate,
    })
    expect(navigate).toHaveBeenCalledTimes(1)
    const authUrl = navigate.mock.calls[0]?.[0]
    expect(typeof authUrl).toBe('string')
    if (typeof authUrl !== 'string') return
    expect(authUrl).toContain('https://openrouter.ai/auth?')
    expect(authUrl).toContain('code_challenge_method=S256')
    expect(storage.length).toBe(1)
  })

  it('exchanges a code for a key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ key: 'sk-or-v1-live' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const key = await exchangeOpenRouterCode({
      code: 'auth-code',
      codeVerifier: 'verifier',
      codeChallengeMethod: 'S256',
      fetchImpl,
    })
    expect(key).toBe('sk-or-v1-live')
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/auth/keys',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    const init = fetchImpl.mock.calls[0]?.[1]
    expect(init).toBeDefined()
    if (!init || typeof init !== 'object' || !('body' in init)) return
    expect(init.body).toBe(
      JSON.stringify({
        code: 'auth-code',
        code_verifier: 'verifier',
        code_challenge_method: 'S256',
      }),
    )
  })

  it('returns null when the URL has no code', async () => {
    expect(
      await completeOpenRouterPkceFromUrl({
        url: 'https://app.example/chat',
      }),
    ).toBeNull()
  })

  it('throws when a code is present without a PKCE session', async () => {
    vi.stubGlobal('sessionStorage', memorySessionStorage())
    await expect(
      completeOpenRouterPkceFromUrl({
        url: 'https://app.example/chat?code=abc',
      }),
    ).rejects.toThrow(/PKCE session expired/)
  })

  it('saves the exchanged key under openrouterByok.id', async () => {
    const storage = memorySessionStorage()
    vi.stubGlobal('sessionStorage', storage)
    storeOpenRouterPkcePending({
      codeVerifier: 'verifier',
      codeChallengeMethod: 'S256',
      callbackUrl: 'https://app.example/chat',
    })
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ key: 'sk-or-v1-live' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const update = vi.fn()
    const key = await completeOpenRouterPkceIntoByok(
      { update },
      {
        url: 'https://app.example/chat?code=abc',
        fetchImpl,
        cleanUrl: false,
      },
    )
    expect(key).toBe('sk-or-v1-live')
    expect(openrouterByok.id).toBe('openrouter')
    expect(update).toHaveBeenCalledWith(openrouterByok.id, 'sk-or-v1-live')
    expect(storage.length).toBe(0)
  })
})
