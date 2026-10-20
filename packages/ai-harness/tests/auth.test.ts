import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import { describe, expect, it, vi } from 'vitest'
import { EventType, defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  HARNESS_EVENTS,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
  oauthConnector,
  scrubSecrets,
} from '../src'
import {
  buildAuthorizationUrl,
  createPkce,
  deviceLogin,
  exchangeCode,
  loopbackLogin,
  refreshCredential,
} from '../src/oauth'
import { mockAdapter, text, toolCall } from './helpers'
import type { HarnessRunContext, SessionEvent } from '../src'
import type { OAuthConfig } from '../src/oauth'

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

    const refreshed = await refreshCredential(oauth, first, { fetch: fake })
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
      expiresAt: expect.any(Number),
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
        }).server<HarnessRunContext>(async (_args, ctx) => {
          seenTokens.push(await token({ run: ctx.context.run }))
          return ['#1']
        }),
      ],
    })
    const persistence = memoryPersistence()
    const credentials = memoryCredentialStore()
    const { adapter } = mockAdapter([
      () => toolCall('list_issues', {}),
      () => text('Sign in first.'),
      () => toolCall('list_issues', {}),
      () => text('One issue.'),
    ])
    const host = createHarnessHost({ persistence, credentials })
    const session = await host.open(
      defineHarness({
        name: 'test/connector',
        adapter,
        plugins: () => [github],
      }),
      {
        threadId: 't',
        user: { id: 'user-1' },
      },
    )
    const events: Array<SessionEvent> = []
    const reader = new AbortController()
    const reading = (async () => {
      for await (const entry of session.events({ signal: reader.signal }))
        events.push(entry)
    })()

    // Before sign-in, the tool asks for it.
    await session.send('list my issues')
    expect(seenTokens).toEqual([])
    expect(
      events.some(
        (entry) =>
          entry.event.type === 'CUSTOM' &&
          entry.event.name === HARNESS_EVENTS.authRequired &&
          (entry.event.value as { connector: string }).connector === 'github',
      ),
    ).toBe(true)

    await expect(session.runCommand({ name: 'connect:github' })).resolves.toBe(
      'Connected to GitHub.',
    )
    const saved = await credentials.get({
      scope: { threadId: 't', userId: 'user-1' },
      id: 'github',
    })
    expect(saved).toMatchObject({ accessToken: 'gh-token' })

    await session.send('list my issues again')
    expect(seenTokens).toEqual(['gh-token'])
    // The model never sees the token.
    const transcript = JSON.stringify(await session.transcript())
    expect(transcript).toContain('list my issues again')
    expect(transcript).not.toContain('gh-token')

    await session.runCommand({ name: 'disconnect:github' })
    expect(
      await credentials.list({
        threadId: 't',
        userId: 'user-1',
      }),
    ).toEqual([])
    reader.abort()
    await reading
    await host.close()
  })
})

describe('commands on close', () => {
  it('ends a command that ignores its signal when the session closes', async () => {
    let started: () => void = () => {}
    const running = new Promise<void>((resolve) => {
      started = resolve
    })
    const plugin = definePlugin({
      name: 'test/stuck',
      setup: () => ({
        commands: {
          stuck: defineCommand({
            description: 'Waits for ever',
            run: () => {
              started()
              return new Promise(() => {})
            },
          }),
        },
      }),
    })
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      credentials: memoryCredentialStore(),
    })
    const session = await host.open(
      defineHarness({
        name: 'test/stuck',
        adapter: mockAdapter(() => text('ok')).adapter,
        plugins: () => [plugin],
      }),
      { threadId: 't1' },
    )
    const command = session.runCommand({ name: 'stuck' })
    await running
    await host.close()
    expect(command.status()).toBe('cancelled')
  })
})

describe('scrubSecrets', () => {
  it('removes known secrets from text', () => {
    expect(scrubSecrets('token gh-abcdef1234 failed', ['gh-abcdef1234'])).toBe(
      'token [redacted] failed',
    )
  })
})

describe('errors a session publishes', () => {
  it('redacts a credential the command read, also in its JSON form', async () => {
    const secret = 'sk-"live"-123456'
    const plugin = definePlugin({
      name: 'test/leaky',
      setup: () => ({
        commands: {
          leak: defineCommand({
            description: 'Call the API',
            run: async (_input, { credentials }) => {
              const credential = await credentials.require('acme')
              const value =
                credential.type === 'api_key' ? credential.value : ''
              throw new Error(
                `fetch failed: Bearer ${value} ${JSON.stringify({ value })}`,
              )
            },
          }),
        },
      }),
    })
    const persistence = memoryPersistence()
    const credentials = memoryCredentialStore()
    await credentials.set({
      scope: { threadId: 't1' },
      id: 'acme',
      credential: { type: 'api_key', value: secret },
    })
    const { adapter } = mockAdapter(() => text('ok'))
    const host = createHarnessHost({ persistence, credentials })
    const session = await host.open(
      defineHarness({
        name: 'test/scrub',
        adapter,
        plugins: () => [plugin],
      }),
      {
        threadId: 't1',
      },
    )
    const errors: Array<string> = []
    session.onEvent(EventType.RUN_ERROR, ({ event }) => {
      errors.push(event.message)
    })

    await expect(session.runCommand({ name: 'leak' })).rejects.toThrow()

    expect(errors).toEqual([
      'fetch failed: Bearer [redacted] {"value":"[redacted]"}',
    ])
    await host.close()
  })

  it('redacts a key that a background agent read', async () => {
    const secret = 'sk-agent-123456'
    const leaky = defineAgent({
      name: 'leaky',
      description: 'Calls the API',
      run: async (ctx) => {
        const key = await ctx.keys.require('acme')
        throw new Error(`fetch failed: Bearer ${key}`)
      },
    })
    const persistence = memoryPersistence()
    const credentials = memoryCredentialStore()
    await credentials.set({
      scope: { threadId: 't1' },
      id: 'acme',
      credential: { type: 'api_key', value: secret },
    })
    const { adapter } = mockAdapter(() => text('ok'))
    const host = createHarnessHost({ persistence, credentials })
    const session = await host.open(
      defineHarness({ name: 'test/scrub', adapter, agents: [leaky] }),
      {
        threadId: 't1',
      },
    )
    const errors: Array<string> = []
    session.onEvent(EventType.RUN_ERROR, ({ event }) => {
      errors.push(event.message)
    })

    const run = session.agents.leaky.run()
    await expect(run).rejects.toThrow('[redacted]')

    expect(errors).toEqual(['fetch failed: Bearer [redacted]'])
    await host.close()
  })
})
