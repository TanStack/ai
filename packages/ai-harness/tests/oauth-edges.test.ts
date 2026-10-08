import { describe, expect, it } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  AuthRequiredError,
  buildAuthorizationUrl,
  createHarnessHost,
  defineHarness,
  deviceLogin,
  exchangeCode,
  isExpired,
  loopbackLogin,
  oauthConnector,
  refreshCredential,
  scrubSecrets,
} from '../src'
import { mockAdapter, text, toolCall } from './helpers'
import type { OAuthConfig } from '../src'

const oauth: OAuthConfig = {
  authorizationUrl: 'https://auth.example/authorize',
  tokenUrl: 'https://auth.example/token',
  deviceUrl: 'https://auth.example/device',
  clientId: 'client-1',
}

/** A fetch that answers each call with the next body, and records the forms. */
function replies(bodies: Array<unknown>, status = 200) {
  const forms: Array<URLSearchParams> = []
  const fake: typeof fetch = async (_input, init) => {
    forms.push(new URLSearchParams(String(init?.body ?? '')))
    const body = bodies.shift()
    return new Response(
      typeof body === 'string' ? body : JSON.stringify(body),
      {
        status,
      },
    )
  }
  return { fake, forms }
}

describe('token requests', () => {
  it('sends the client secret and keeps the old refresh token', async () => {
    const { fake, forms } = replies([
      { access_token: 'a2', expires_in: 60, scope: 'repo,read:user' },
    ])
    const refreshed = await refreshCredential(
      { ...oauth, clientSecret: 'shh' },
      { type: 'oauth', accessToken: 'a1', refreshToken: 'r1' },
      fake,
    )
    expect(forms[0]?.get('client_secret')).toBe('shh')
    expect(refreshed).toMatchObject({
      type: 'oauth',
      accessToken: 'a2',
      refreshToken: 'r1',
      scopes: ['repo', 'read:user'],
    })
    expect(refreshed.type === 'oauth' && refreshed.expiresAt).toBeGreaterThan(
      Date.now(),
    )
  })

  it('refuses a credential without a refresh token', async () => {
    await expect(
      refreshCredential(oauth, { type: 'oauth', accessToken: 'a' }),
    ).rejects.toThrow('no refresh token')
    await expect(
      refreshCredential(oauth, { type: 'api_key', value: 'k' }),
    ).rejects.toThrow('no refresh token')
  })

  it('reports bodies that are not token objects', async () => {
    const options = { code: 'c', verifier: 'v', redirectUri: 'http://x' }
    await expect(
      exchangeCode(oauth, { ...options, fetch: replies(['"text"'], 500).fake }),
    ).rejects.toThrow('OAuth token request failed (500).')
    await expect(
      exchangeCode(oauth, { ...options, fetch: replies(['not json']).fake }),
    ).rejects.toThrow('no access_token')
  })

  it('knows when a credential expires', () => {
    expect(isExpired({ type: 'api_key', value: 'k' })).toBe(false)
    expect(isExpired({ type: 'oauth', accessToken: 'a' })).toBe(false)
    expect(
      isExpired({
        type: 'oauth',
        accessToken: 'a',
        expiresAt: Date.now() + 30_000,
      }),
    ).toBe(true)
    expect(
      isExpired(
        { type: 'oauth', accessToken: 'a', expiresAt: Date.now() + 30_000 },
        0,
      ),
    ).toBe(false)
  })

  it('leaves the scope out of the URL when there is none', () => {
    const url = new URL(
      buildAuthorizationUrl(oauth, {
        redirectUri: 'http://127.0.0.1:1/callback',
        state: 's',
        challenge: 'c',
      }),
    )
    expect(url.searchParams.has('scope')).toBe(false)
  })
})

describe('loopbackLogin edges', () => {
  async function login(
    callback: (redirect: URL, state: string) => string,
    options: { timeoutMs?: number } = {},
  ) {
    const { fake } = replies([{ access_token: 'token' }])
    return loopbackLogin(oauth, {
      fetch: fake,
      ...options,
      onUrl: (value) => {
        const url = new URL(value)
        const redirect = new URL(url.searchParams.get('redirect_uri') ?? '')
        const state = url.searchParams.get('state') ?? ''
        void (async () => {
          // A request to another path does not end the sign-in.
          await fetch(new URL('/favicon.ico', redirect))
          await fetch(callback(redirect, state))
        })()
      },
    })
  }

  it('reports the error from the server and a missing code', async () => {
    await expect(
      login(
        (redirect, state) => `${redirect}?state=${state}&error=access_denied`,
      ),
    ).rejects.toThrow('Sign-in failed: access_denied')
    await expect(
      login((redirect, state) => `${redirect}?state=${state}`),
    ).rejects.toThrow('Sign-in failed: no code')
  })

  it('times out when nobody comes back', async () => {
    await expect(
      loopbackLogin(oauth, { onUrl: () => {}, timeoutMs: 10 }),
    ).rejects.toThrow('Sign-in timed out.')
  })
})

describe('deviceLogin edges', () => {
  const noSleep = async () => {}

  it('needs a device endpoint and a device code', async () => {
    await expect(
      deviceLogin({ ...oauth, deviceUrl: undefined }, { onCode: () => {} }),
    ).rejects.toThrow('no device endpoint')
    await expect(
      deviceLogin(oauth, {
        onCode: () => {},
        fetch: replies([{ user_code: 'X' }]).fake,
        sleep: noSleep,
      }),
    ).rejects.toThrow('no device code')
  })

  it('slows down when asked, sends scopes, and falls back to the authorization URL', async () => {
    const waits: Array<number> = []
    const shown: Array<string> = []
    const { fake, forms } = replies([
      { device_code: 'd', user_code: 'CODE' },
      { error: 'slow_down' },
      { error: 'authorization_pending' },
      { access_token: 'granted' },
    ])
    const credential = await deviceLogin(
      { ...oauth, scopes: ['repo'] },
      {
        onCode: (info) =>
          shown.push(`${info.userCode} ${info.verificationUri}`),
        fetch: fake,
        sleep: async (ms) => {
          waits.push(ms)
        },
      },
    )
    expect(forms[0]?.get('scope')).toBe('repo')
    expect(shown).toEqual(['CODE https://auth.example/authorize'])
    expect(waits).toEqual([5000, 10000, 10000])
    expect(credential).toMatchObject({ accessToken: 'granted' })
  })

  it('stops when the device code expires', async () => {
    const { fake } = replies([
      { device_code: 'd', user_code: 'C', expires_in: 0, interval: 0 },
    ])
    await expect(
      deviceLogin(oauth, { onCode: () => {}, fetch: fake, sleep: noSleep }),
    ).rejects.toThrow('Device sign-in expired.')
  })
})

describe('oauthConnector edges', () => {
  function connector(fetchFn: typeof fetch, seen: Array<string>) {
    return oauthConnector({
      id: 'svc',
      label: 'Service',
      oauth,
      fetch: fetchFn,
      tools: (token) => [
        toolDefinition({ name: 'whoami', description: 'Who am I' }).server(
          async () => {
            seen.push(await token())
            return 'me'
          },
        ),
      ],
    })
  }

  it('refreshes an expired token, and passes an API key through', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.credentials.set(
      { threadId: 't1', userId: 'u1' },
      'svc',
      {
        type: 'oauth',
        accessToken: 'old',
        refreshToken: 'r',
        expiresAt: Date.now() - 1,
      },
    )
    await persistence.stores.credentials.set(
      { threadId: 't2', userId: 'u2' },
      'svc',
      {
        type: 'api_key',
        value: 'key-1',
      },
    )
    const seen: Array<string> = []
    const { fake } = replies([{ access_token: 'fresh', expires_in: 3600 }])
    const { adapter } = mockAdapter([
      () => toolCall('whoami', {}),
      () => text('done'),
      () => toolCall('whoami', {}),
      () => text('done'),
    ])
    const host = createHarnessHost({ persistence })
    const harness = defineHarness({
      name: 'test/refresh',
      adapter,
      plugins: () => [connector(fake, seen)],
    })
    await (
      await host.open(harness, { threadId: 't1', principal: { id: 'u1' } })
    ).prompt('who')
    await (
      await host.open(harness, { threadId: 't2', principal: { id: 'u2' } })
    ).prompt('who')
    expect(seen).toEqual(['fresh', 'key-1'])
    expect(
      await persistence.stores.credentials.get(
        { threadId: 't1', userId: 'u1' },
        'svc',
      ),
    ).toMatchObject({ accessToken: 'fresh', refreshToken: 'r' })
    await host.close()
  })

  it('signs in through the loopback and signs out', async () => {
    const persistence = memoryPersistence()
    const { fake } = replies([{ access_token: 'loop-token' }])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({
        name: 'test/loopback-connector',
        adapter: mockAdapter([]).adapter,
        plugins: () => [connector(fake, [])],
      }),
      { threadId: 't' },
    )
    const controller = new AbortController()
    const signIn = (async () => {
      for await (const entry of session.events({ signal: controller.signal })) {
        const value =
          entry.event.type === 'CUSTOM' ? entry.event.value : undefined
        if (
          typeof value === 'object' &&
          value !== null &&
          'url' in value &&
          typeof value.url === 'string'
        ) {
          const url = new URL(value.url)
          const redirect = url.searchParams.get('redirect_uri') ?? ''
          const state = url.searchParams.get('state') ?? ''
          await fetch(`${redirect}?code=c&state=${state}`)
          return
        }
      }
    })()
    expect(await session.command('connect:svc')).toBe('Connected to Service.')
    controller.abort()
    await signIn
    expect(
      await persistence.stores.credentials.get({ threadId: 't' }, 'svc'),
    ).toMatchObject({ accessToken: 'loop-token' })
    expect(await session.command('disconnect:svc')).toBe(
      'Disconnected from Service.',
    )
    expect(
      await persistence.stores.credentials.get({ threadId: 't' }, 'svc'),
    ).toBeNull()
    await host.close()
  })
})

describe('auth helpers', () => {
  it('describes the sign-in in the error, with and without a URL', () => {
    expect(new AuthRequiredError('svc').message).toContain('/connect svc')
    const withUrl = new AuthRequiredError('svc', 'https://x/login')
    expect(withUrl.message).toContain('https://x/login')
    expect(withUrl.url).toBe('https://x/login')
  })

  it('keeps short strings when scrubbing', () => {
    expect(
      scrubSecrets('pin 12345 and token abcdef', ['12345', 'abcdef']),
    ).toBe('pin 12345 and token [redacted]')
  })
})
