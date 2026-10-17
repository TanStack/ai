import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  AuthRequiredError,
  createHarnessHost,
  defineHarness,
  oauthConnector,
  scrubSecrets,
} from '../src'
import {
  buildAuthorizationUrl,
  deviceLogin,
  exchangeCode,
  isExpired,
  loopbackLogin,
  refreshCredential,
} from '../src/oauth'
import { mockAdapter, text, toolCall } from './helpers'
import type { HarnessRunContext, HarnessSession } from '../src'
import type { OAuthConfig } from '../src/oauth'

const oauth: OAuthConfig = {
  authorizationUrl: 'https://auth.example/authorize',
  tokenUrl: 'https://auth.example/token',
  deviceUrl: 'https://auth.example/device',
  clientId: 'client-1',
}

afterEach(() => {
  vi.useRealTimers()
})

/** A device-flow `sleep` that returns at once, and records each wait. */
function recordedSleep() {
  const waits: Array<number> = []
  const sleep = async (ms: number) => {
    waits.push(ms)
  }
  return { waits, sleep }
}

/** The first sign-in URL that `session` asks the user to open. */
async function nextSignInUrl(session: HarnessSession) {
  for await (const entry of session.events()) {
    const value = entry.event.type === 'CUSTOM' ? entry.event.value : undefined
    if (
      typeof value === 'object' &&
      value !== null &&
      'url' in value &&
      typeof value.url === 'string'
    ) {
      return new URL(value.url)
    }
  }
  throw new Error('The session closed before it asked for a sign-in.')
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
      { fetch: fake },
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
    config = oauth,
  ) {
    const { fake } = replies([{ access_token: 'token' }])
    return loopbackLogin(config, {
      fetch: fake,
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

  it('refuses a code from another issuer (RFC 9207)', async () => {
    const config = { ...oauth, issuer: 'https://auth.example' }
    const sentBy = (iss: string) => (redirect: URL, state: string) =>
      `${redirect}?code=c&state=${state}&iss=${encodeURIComponent(iss)}`
    await expect(
      login(sentBy('https://other.example'), config),
    ).rejects.toThrow('Sign-in failed: the issuer does not match.')
    await expect(
      login(sentBy('https://auth.example'), config),
    ).resolves.toMatchObject({ accessToken: 'token' })
  })

  it('stops listening and leaves no timer when onUrl throws', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let redirect = ''
    await expect(
      loopbackLogin(oauth, {
        onUrl: (value) => {
          redirect = new URL(value).searchParams.get('redirect_uri') ?? ''
          throw new Error('No browser here.')
        },
      }),
    ).rejects.toThrow('No browser here.')
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
    await expect(fetch(redirect)).rejects.toThrow()
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
    const { waits, sleep } = recordedSleep()
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
        sleep,
      },
    )
    expect(forms[0]?.get('scope')).toBe('repo')
    expect(shown).toEqual(['CODE https://auth.example/authorize'])
    expect(waits).toEqual([5000, 10000, 10000])
    expect(credential).toMatchObject({ accessToken: 'granted' })
  })

  it('waits at least one second between polls', async () => {
    const { waits, sleep } = recordedSleep()
    const { fake } = replies([
      { device_code: 'd', user_code: 'C', interval: 0 },
      { access_token: 'granted' },
    ])
    await deviceLogin(oauth, { onCode: () => {}, fetch: fake, sleep })
    expect(waits).toEqual([1000])
  })

  it('stops polling at once when the signal aborts', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const controller = new AbortController()
    const reason = new Error('The user left.')
    const { fake, forms } = replies([{ device_code: 'd', user_code: 'C' }])
    let showCode: () => void = () => {}
    const shown = new Promise<void>((resolve) => {
      showCode = resolve
    })
    const login = deviceLogin(oauth, {
      onCode: () => showCode(),
      fetch: fake,
      signal: controller.signal,
    })
    await shown
    // The first poll waits its 5 seconds.
    expect(vi.getTimerCount()).toBe(1)
    controller.abort(reason)
    await expect(login).rejects.toBe(reason)
    // Only the device request went out, and no timer is left.
    expect(forms).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
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
      login: 'loopback',
      oauth,
      fetch: fetchFn,
      tools: (token) => [
        toolDefinition({
          name: 'whoami',
          description: 'Who am I',
        }).server<HarnessRunContext>(async (_args, ctx) => {
          seen.push(await token({ run: ctx.context.run }))
          return 'me'
        }),
      ],
    })
  }

  it('refreshes an expired token, and passes an API key through', async () => {
    const persistence = memoryPersistence()
    const credentials = memoryCredentialStore()
    await credentials.set({
      scope: { threadId: 't1', userId: 'u1' },
      id: 'svc',
      credential: {
        type: 'oauth',
        accessToken: 'old',
        refreshToken: 'r',
        expiresAt: Date.now() - 1,
      },
    })
    await credentials.set({
      scope: { threadId: 't2', userId: 'u2' },
      id: 'svc',
      credential: {
        type: 'api_key',
        value: 'key-1',
      },
    })
    const seen: Array<string> = []
    const { fake } = replies([{ access_token: 'fresh', expires_in: 3600 }])
    const { adapter } = mockAdapter([
      () => toolCall('whoami', {}),
      () => text('done'),
      () => toolCall('whoami', {}),
      () => text('done'),
    ])
    const host = createHarnessHost({ persistence, credentials })
    const harness = defineHarness({
      name: 'test/refresh',
      adapter,
      plugins: () => [connector(fake, seen)],
    })
    await (
      await host.open(harness, { threadId: 't1', principal: { id: 'u1' } })
    ).send('who')
    await (
      await host.open(harness, { threadId: 't2', principal: { id: 'u2' } })
    ).send('who')
    expect(seen).toEqual(['fresh', 'key-1'])
    expect(
      await credentials.get({
        scope: { threadId: 't1', userId: 'u1' },
        id: 'svc',
      }),
    ).toMatchObject({ accessToken: 'fresh', refreshToken: 'r' })
    await host.close()
  })

  /** A session of thread `t` with the loopback connector `svc`. */
  async function openLoopback(fetchFn: typeof fetch) {
    const credentials = memoryCredentialStore()
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      credentials,
    })
    const session = await host.open(
      defineHarness({
        name: 'test/loopback-connector',
        adapter: mockAdapter([]).adapter,
        plugins: () => [connector(fetchFn, [])],
      }),
      {
        threadId: 't',
      },
    )
    return { credentials, host, session }
  }

  it('signs in through the loopback and signs out', async () => {
    const { fake } = replies([{ access_token: 'loop-token' }])
    const { credentials, host, session } = await openLoopback(fake)
    const asked = nextSignInUrl(session)
    const connecting = session.command({ name: 'connect:svc' })
    const url = await asked
    const redirect = url.searchParams.get('redirect_uri') ?? ''
    const state = url.searchParams.get('state') ?? ''
    await fetch(`${redirect}?code=c&state=${state}`)
    expect(await connecting).toBe('Connected to Service.')
    expect(
      await credentials.get({
        scope: { threadId: 't' },
        id: 'svc',
      }),
    ).toMatchObject({ accessToken: 'loop-token' })
    expect(await session.command({ name: 'disconnect:svc' })).toBe(
      'Disconnected from Service.',
    )
    expect(
      await credentials.get({
        scope: { threadId: 't' },
        id: 'svc',
      }),
    ).toBeNull()
    await host.close()
  })

  it('closes the session at once while /connect waits for the browser', async () => {
    const { host, session } = await openLoopback(replies([]).fake)
    const asked = nextSignInUrl(session)
    const connecting = session.command({ name: 'connect:svc' })
    const redirect = (await asked).searchParams.get('redirect_uri') ?? ''
    await session.close()
    expect(connecting.status()).toBe('cancelled')
    // The sign-in stopped too: nothing listens for the redirect now.
    await expect(fetch(redirect)).rejects.toThrow()
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
