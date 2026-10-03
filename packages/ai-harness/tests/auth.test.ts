import { describe, expect, it, vi } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  HARNESS_EVENTS,
  buildAuthorizationUrl,
  createHarnessHost,
  createPkce,
  defineHarness,
  deviceLogin,
  exchangeCode,
  loopbackLogin,
  oauthConnector,
  refreshCredential,
  scrubSecrets,
} from '../src'
import { mockAdapter, text, toolCall } from './helpers'
import type { OAuthConfig, SessionEvent } from '../src'

const oauth: OAuthConfig = {
  authorizationUrl: 'https://auth.example/authorize',
  tokenUrl: 'https://auth.example/token',
  deviceUrl: 'https://auth.example/device',
  clientId: 'client-1',
  scopes: ['repo', 'read:user'],
}

/** A fake token endpoint that records each form body. */
function tokenEndpoint(responses: Array<Record<string, unknown>>) {
  const bodies: Array<URLSearchParams> = []
  const fake: typeof fetch = async (_input, init) => {
    bodies.push(new URLSearchParams(String(init?.body)))
    return new Response(JSON.stringify(responses.shift() ?? {}), {
      headers: { 'content-type': 'application/json' },
    })
  }
  return { fake, bodies }
}

describe('PKCE and URLs', () => {
  it('makes an S256 challenge from the verifier', async () => {
    const { verifier, challenge } = await createPkce()
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(verifier),
    )
    const expected = Buffer.from(digest).toString('base64url')
    expect(challenge).toBe(expected)
    expect(verifier.length).toBeGreaterThanOrEqual(43)
  })

  it('builds the authorization URL with state, PKCE, and scopes', () => {
    const url = new URL(
      buildAuthorizationUrl(oauth, {
        redirectUri: 'http://127.0.0.1:5000/callback',
        state: 's1',
        challenge: 'c1',
      }),
    )
    expect(url.searchParams.get('client_id')).toBe('client-1')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('scope')).toBe('repo read:user')
    expect(url.searchParams.get('state')).toBe('s1')
  })
})

describe('token exchange', () => {
  it('trades a code for tokens and refreshes them', async () => {
    const { fake, bodies } = tokenEndpoint([
      {
        access_token: 'a1',
        refresh_token: 'r1',
        expires_in: 3600,
        scope: 'repo',
      },
      { access_token: 'a2', expires_in: 3600 },
    ])
    const first = await exchangeCode(oauth, {
      code: 'code-1',
      verifier: 'v1',
      redirectUri: 'http://127.0.0.1/callback',
      fetch: fake,
    })
    expect(first).toMatchObject({
      type: 'oauth',
      accessToken: 'a1',
      refreshToken: 'r1',
      scopes: ['repo'],
    })
    expect(bodies[0]?.get('code_verifier')).toBe('v1')

    const refreshed = await refreshCredential(oauth, first, fake)
    // The old refresh token stays when the server sends no new one.
    expect(refreshed).toMatchObject({ accessToken: 'a2', refreshToken: 'r1' })
    expect(bodies[1]?.get('grant_type')).toBe('refresh_token')
  })

  it('reports an OAuth error', async () => {
    const { fake } = tokenEndpoint([{ error: 'bad_verification_code' }])
    await expect(
      exchangeCode(oauth, {
        code: 'x',
        verifier: 'y',
        redirectUri: 'z',
        fetch: fake,
      }),
    ).rejects.toThrow('bad_verification_code')
  })
})

describe('loopback login', () => {
  it('receives the code on 127.0.0.1 and rejects a wrong state', async () => {
    const { fake } = tokenEndpoint([{ access_token: 'loop-token' }])
    const signedIn = loopbackLogin(oauth, {
      fetch: fake,
      onUrl: (url) => {
        const parsed = new URL(url)
        const redirect = new URL(parsed.searchParams.get('redirect_uri')!)
        expect(redirect.hostname).toBe('127.0.0.1')
        redirect.searchParams.set('code', 'the-code')
        redirect.searchParams.set('state', parsed.searchParams.get('state')!)
        void fetch(redirect)
      },
    })
    await expect(signedIn).resolves.toMatchObject({ accessToken: 'loop-token' })

    const forged = loopbackLogin(oauth, {
      fetch: fake,
      onUrl: (url) => {
        const redirect = new URL(new URL(url).searchParams.get('redirect_uri')!)
        redirect.searchParams.set('code', 'x')
        redirect.searchParams.set('state', 'forged')
        void fetch(redirect)
      },
    })
    await expect(forged).rejects.toThrow('state does not match')
  })
})

describe('device login', () => {
  it('shows the code and polls until the user approves', async () => {
    const responses: Array<Record<string, unknown>> = [
      {
        device_code: 'd1',
        user_code: 'ABCD-1234',
        verification_uri: 'https://auth.example/device',
        interval: 1,
      },
      { error: 'authorization_pending' },
      { access_token: 'device-token' },
    ]
    const fake: typeof fetch = async () =>
      new Response(JSON.stringify(responses.shift()), {
        headers: { 'content-type': 'application/json' },
      })
    const onCode = vi.fn()
    const credential = await deviceLogin(oauth, {
      fetch: fake,
      onCode,
      sleep: async () => {},
    })
    expect(onCode).toHaveBeenCalledWith({
      userCode: 'ABCD-1234',
      verificationUri: 'https://auth.example/device',
    })
    expect(credential).toMatchObject({ accessToken: 'device-token' })
  })
})

describe('oauthConnector', () => {
  it('asks for sign-in, connects, and gives tools a token', async () => {
    const seenTokens: Array<string> = []
    const responses: Array<Record<string, unknown>> = [
      {
        device_code: 'd1',
        user_code: 'WXYZ',
        verification_uri: 'https://gh.example/device',
        interval: 1,
      },
      { access_token: 'gh-token' },
    ]
    const fake: typeof fetch = async () =>
      new Response(JSON.stringify(responses.shift()), {
        headers: { 'content-type': 'application/json' },
      })
    const github = oauthConnector({
      id: 'github',
      label: 'GitHub',
      oauth,
      login: 'device',
      fetch: fake,
      tools: (token) => [
        toolDefinition({
          name: 'list_issues',
          description: 'List issues',
        }).server(async () => {
          seenTokens.push(await token())
          return ['#1']
        }),
      ],
    })
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([
      () => toolCall('list_issues', {}),
      () => text('Sign in first.'),
      () => toolCall('list_issues', {}),
      () => text('One issue.'),
    ])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({
        name: 'test/connector',
        adapter,
        plugins: () => [github],
      }),
      { threadId: 't', principal: { id: 'user-1' } },
    )
    const events: Array<SessionEvent> = []
    const reader = new AbortController()
    const reading = (async () => {
      for await (const entry of session.events({ signal: reader.signal }))
        events.push(entry)
    })()

    // Before sign-in, the tool asks for it.
    await session.prompt('list my issues')
    expect(seenTokens).toEqual([])
    expect(
      events.some(
        (entry) =>
          entry.event.type === 'CUSTOM' &&
          entry.event.name === HARNESS_EVENTS.authRequired &&
          (entry.event.value as { connector: string }).connector === 'github',
      ),
    ).toBe(true)

    await expect(session.command('connect:github')).resolves.toBe(
      'Connected to GitHub.',
    )
    const saved = await persistence.stores.credentials.get(
      { threadId: 't', userId: 'user-1' },
      'github',
    )
    expect(saved).toMatchObject({ accessToken: 'gh-token' })

    await session.prompt('list my issues again')
    expect(seenTokens).toEqual(['gh-token'])
    // The model never sees the token.
    const transcript = JSON.stringify(
      await persistence.stores.messages.loadThread('t'),
    )
    expect(transcript).not.toContain('gh-token')

    await session.command('disconnect:github')
    expect(
      await persistence.stores.credentials.list({
        threadId: 't',
        userId: 'user-1',
      }),
    ).toEqual([])
    reader.abort()
    await reading
    await host.close()
  })
})

describe('scrubSecrets', () => {
  it('removes known secrets from text', () => {
    expect(scrubSecrets('token gh-abcdef1234 failed', ['gh-abcdef1234'])).toBe(
      'token [redacted] failed',
    )
  })
})
