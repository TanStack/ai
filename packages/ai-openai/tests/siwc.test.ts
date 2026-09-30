// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  completeChatGptSignIn,
  refreshChatGptSignIn,
  saveChatGptSignIn,
  startChatGptSignIn,
} from '../src/siwc'

const REDIRECT = 'http://127.0.0.1:3000/auth/callback'

function memoryStore(initial: Record<string, string> = {}) {
  const keys: Record<string, string> = { ...initial }
  return {
    keys: () => ({ ...keys }),
    update: (provider: string, key: string) => {
      keys[provider] = key
    },
    clear: (provider?: string) => {
      if (provider) delete keys[provider]
    },
  }
}

function idToken(claims: Record<string, unknown>): string {
  const payload = btoa(JSON.stringify(claims))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `header.${payload}.signature`
}

function tokenFetch(body: Record<string, unknown>, status = 200) {
  return vi.fn<typeof fetch>(async () =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  )
}

async function start(): Promise<URL> {
  let target = ''
  await startChatGptSignIn({
    agentName: 'Test App',
    redirectUri: REDIRECT,
    navigate: (url) => {
      target = url
    },
  })
  return new URL(target)
}

function callback(params: Record<string, string>): string {
  return `${REDIRECT}?${new URLSearchParams(params).toString()}`
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('startChatGptSignIn', () => {
  it('registers a dynamic client with PKCE and a stable host id', async () => {
    const url = await start()
    expect(url.origin + url.pathname).toBe(
      'https://auth.openai.com/api/accounts/authorize',
    )
    const p = url.searchParams
    expect(p.get('client_id')).toBe('dynamic_agent_client')
    expect(p.get('agent_name_hint')).toBe('Test App')
    expect(p.get('ext_agent_host_id')).toMatch(/^urn:uuid:/)
    expect(p.get('redirect_uri')).toBe(REDIRECT)
    expect(p.get('scope')).toContain('chatgpt.tokens.use.direct')
    expect(p.get('resource')).toBe('https://api.openai.com/v1')
    expect(p.get('code_challenge_method')).toBe('S256')
    expect(p.get('code_challenge')).toBeTruthy()

    const again = await start()
    expect(again.searchParams.get('ext_agent_host_id')).toBe(
      p.get('ext_agent_host_id'),
    )
    expect(again.searchParams.get('state')).not.toBe(p.get('state'))
  })

  it('rejects a localhost redirect', async () => {
    await expect(
      startChatGptSignIn({
        agentName: 'Test App',
        redirectUri: 'http://localhost:3000/auth/callback',
        navigate: () => {},
      }),
    ).rejects.toThrow('127.0.0.1')
  })
})

describe('completeChatGptSignIn', () => {
  it('returns false when the URL is not a callback', async () => {
    expect(await completeChatGptSignIn({ url: REDIRECT })).toBeNull()
  })

  it('exchanges the code and saves the token and credential', async () => {
    const auth = await start()
    const state = auth.searchParams.get('state') ?? ''
    const nonce = auth.searchParams.get('nonce') ?? ''
    const fetchImpl = tokenFetch({
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      expires_in: 3600,
      scope: 'openid chatgpt.tokens.use.direct',
      id_token: idToken({
        iss: 'https://auth.openai.com',
        aud: 'oaiapp_1',
        nonce,
      }),
    })
    const store = memoryStore()

    const signIn = await completeChatGptSignIn({
      url: callback({ code: 'c1', state, client_id: 'oaiapp_1' }),
      fetchImpl,
    })
    expect(signIn).not.toBeNull()
    if (signIn) await saveChatGptSignIn(store, signIn)

    expect(store.keys().openai).toBe('access-1')
    const credential = JSON.parse(store.keys()['openai-chatgpt'] ?? '')
    expect(credential).toMatchObject({
      clientId: 'oaiapp_1',
      refreshToken: 'refresh-1',
    })
    const body = new URLSearchParams(String(fetchImpl.mock.calls[0]?.[1]?.body))
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('client_id')).toBe('oaiapp_1')
    expect(body.get('code')).toBe('c1')
    expect(body.get('redirect_uri')).toBe(REDIRECT)
    expect(body.get('code_verifier')).toBeTruthy()

    // The next sign-in reuses the issued client id.
    const next = await start()
    expect(next.searchParams.get('client_id')).toBe('oaiapp_1')
    expect(next.searchParams.has('agent_name_hint')).toBe(false)
  })

  it('rejects a state that does not match', async () => {
    await start()
    await expect(
      completeChatGptSignIn({
        url: callback({ code: 'c1', state: 'other', client_id: 'oaiapp_1' }),
      }),
    ).rejects.toThrow('expired')
  })

  it('surfaces a declined consent', async () => {
    const state = (await start()).searchParams.get('state') ?? ''
    await expect(
      completeChatGptSignIn({
        url: callback({ error: 'access_denied', state }),
      }),
    ).rejects.toThrow('access_denied')
  })

  it('rejects a grant without plan usage', async () => {
    const auth = await start()
    const fetchImpl = tokenFetch({
      access_token: 'a',
      refresh_token: 'r',
      expires_in: 3600,
      scope: 'openid email',
      id_token: idToken({
        iss: 'https://auth.openai.com',
        aud: 'oaiapp_1',
        nonce: auth.searchParams.get('nonce'),
      }),
    })
    await expect(
      completeChatGptSignIn({
        url: callback({
          code: 'c1',
          state: auth.searchParams.get('state') ?? '',
          client_id: 'oaiapp_1',
        }),
        fetchImpl,
      }),
    ).rejects.toThrow('plan use')
  })

  it('rejects an ID token with the wrong nonce', async () => {
    const auth = await start()
    const fetchImpl = tokenFetch({
      access_token: 'a',
      refresh_token: 'r',
      expires_in: 3600,
      scope: 'chatgpt.tokens.use.direct',
      id_token: idToken({
        iss: 'https://auth.openai.com',
        aud: 'oaiapp_1',
        nonce: 'wrong',
      }),
    })
    await expect(
      completeChatGptSignIn({
        url: callback({
          code: 'c1',
          state: auth.searchParams.get('state') ?? '',
          client_id: 'oaiapp_1',
        }),
        fetchImpl,
      }),
    ).rejects.toThrow('another request')
  })
})

describe('refreshChatGptSignIn', () => {
  function signedIn(expiresAt: number) {
    return memoryStore({
      openai: 'access-old',
      'openai-chatgpt': JSON.stringify({
        clientId: 'oaiapp_1',
        refreshToken: 'refresh-old',
        expiresAt,
      }),
    })
  }

  it('does nothing without a ChatGPT sign-in', async () => {
    const fetchImpl = tokenFetch({})
    await refreshChatGptSignIn(memoryStore({ openai: 'sk-test' }), {
      fetchImpl,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does nothing while the token is fresh', async () => {
    const fetchImpl = tokenFetch({})
    await refreshChatGptSignIn(signedIn(Date.now() + 60 * 60 * 1000), {
      fetchImpl,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refreshes once for concurrent calls and rotates the token', async () => {
    const store = signedIn(Date.now())
    const fetchImpl = tokenFetch({
      access_token: 'access-new',
      refresh_token: 'refresh-new',
      expires_in: 3600,
      scope: 'chatgpt.tokens.use.direct',
    })
    await Promise.all([
      refreshChatGptSignIn(store, { fetchImpl }),
      refreshChatGptSignIn(store, { fetchImpl }),
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const body = new URLSearchParams(String(fetchImpl.mock.calls[0]?.[1]?.body))
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('refresh-old')
    expect(body.get('resource')).toBe('https://api.openai.com/v1')
    expect(store.keys().openai).toBe('access-new')
    expect(store.keys()['openai-chatgpt']).toContain('refresh-new')
  })

  it('clears the sign-in when the refresh token is rejected', async () => {
    const store = signedIn(Date.now())
    await expect(
      refreshChatGptSignIn(store, {
        fetchImpl: tokenFetch({ error: 'invalid_grant' }, 400),
      }),
    ).rejects.toThrow('invalid_grant')
    expect(store.keys()).toEqual({})
  })

  it('keeps the sign-in on a server error', async () => {
    const store = signedIn(Date.now())
    await expect(
      refreshChatGptSignIn(store, { fetchImpl: tokenFetch({}, 503) }),
    ).rejects.toThrow('503')
    expect(store.keys().openai).toBe('access-old')
  })

  it('drops the credential when the openai key was removed', async () => {
    const store = signedIn(Date.now())
    store.clear('openai')
    await refreshChatGptSignIn(store, { fetchImpl: tokenFetch({}) })
    expect(store.keys()).toEqual({})
  })
})
