import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  HARNESS_EVENTS,
  createHarnessHost,
  defineHarness,
} from '@tanstack/ai-harness'
import { mcpConnector } from '../src/connector'
import { approveSignIns, recorder } from './connector-helpers'
import { startProtectedServer } from './protected-server'
import type { Credential } from '@tanstack/ai/byok'
import type {
  HarnessHost,
  HarnessSession,
  SessionEvent,
} from '@tanstack/ai-harness'

const scope = { threadId: 't', userId: 'user-1' }
const cleanups: Array<() => unknown> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function setup(
  credential?: Credential,
  serverOptions?: Parameters<typeof startProtectedServer>[0],
) {
  const server = await startProtectedServer(serverOptions)
  cleanups.push(() => server.close())
  const persistence = memoryPersistence()
  const credentials = memoryCredentialStore()
  if (credential) await credentials.set({ scope, id: 'demo', credential })
  const host = createHarnessHost({ persistence, credentials })
  cleanups.push(() => host.close())
  return { server, credentials, host }
}

/** A harness with only the `demo` connector, with default options. */
function connectorHarness(url: string, model: ReturnType<typeof recorder>) {
  return defineHarness({
    name: 'test/connector',
    adapter: model.adapter,
    plugins: () => [mcpConnector({ id: 'demo', label: 'Demo', url })],
  })
}

/** Open a session of {@link connectorHarness} for `user-1`. */
function openDemo(
  host: HarnessHost,
  url: string,
  model = recorder(),
  threadId = 't',
) {
  return host.open(connectorHarness(url, model), {
    threadId,
    user: { id: 'user-1' },
  })
}

/** Run one prompt and return every event the session published for it. */
async function promptAndCollect(session: HarnessSession, text: string) {
  const seen: Array<SessionEvent> = []
  const controller = new AbortController()
  const reading = (async () => {
    for await (const entry of session.events({
      from: '0',
      signal: controller.signal,
    }))
      seen.push(entry)
  })()
  await session.send(text)
  controller.abort()
  await reading
  return seen
}

/** The values of the custom events named `name`, in order. */
function customValues(seen: Array<SessionEvent>, name: string) {
  return seen.flatMap(({ event }) =>
    event.type === EventType.CUSTOM && event.name === name ? [event.value] : [],
  )
}

describe('mcpConnector with a saved sign-in', () => {
  it('uses the saved token and client after a restart, without /connect', async () => {
    const { server, host } = await setup({
      type: 'oauth',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() + 3_600_000,
      client: {
        clientId: 'client-1',
        clientSecret: 'secret-1',
        redirectUri: 'http://127.0.0.1:1/callback',
      },
    })
    const model = recorder('demo_echo')
    const session = await openDemo(host, server.url, model)
    await session.send('echo')
    expect(model.toolNames(0)).toEqual(['demo_echo'])
    expect(JSON.stringify(model.calls[1]?.messages)).toContain('echo: hi')
    // The status prompt is empty once connected.
    expect(JSON.stringify(model.calls[0]?.systemPrompts ?? [])).not.toContain(
      'is not connected',
    )
    expect(server.seen.registrations).toHaveLength(0)
  })

  it.each([
    {
      redirect: 'the saved client redirect URI',
      client: { clientId: 'client-1', redirectUri: 'http://127.0.0.1:1/cb' },
      redirectUri: 'http://127.0.0.1:1/cb',
    },
    {
      redirect: 'the fallback redirect URI',
      client: { clientId: 'client-1' },
      redirectUri: 'http://127.0.0.1/callback',
    },
  ])(
    'refreshes an expired token with $redirect and keeps the old refresh token and client',
    async ({ client, redirectUri }) => {
      const { server, credentials, host } = await setup({
        type: 'oauth',
        accessToken: 'stale',
        refreshToken: 'refresh-1',
        expiresAt: Date.now() - 1000,
        client,
      })
      const model = recorder('demo_echo')
      const session = await openDemo(host, server.url, model)
      await session.send('echo')
      expect(model.toolNames(0)).toEqual(['demo_echo'])
      expect(
        server.seen.tokenRequests.map((form) => form.get('grant_type')),
      ).toEqual(['refresh_token'])
      expect(server.seen.registrations).toHaveLength(0)
      // A sign-in saved without an issuer gets the issuer of this server.
      expect(await credentials.get({ scope, id: 'demo' })).toEqual({
        type: 'oauth',
        accessToken: 'access-2',
        refreshToken: 'refresh-1',
        client: { clientId: 'client-1', redirectUri, issuer: server.issuer },
      })
    },
  )

  it.each([
    {
      failure: 'the refresh token is revoked',
      credential: {
        type: 'oauth',
        accessToken: 'stale',
        refreshToken: 'revoked',
      },
      revoke: [],
      // The server refused the refresh token, so it is deleted.
      kept: null,
    },
    {
      failure: 'the server revokes a token that has no refresh token',
      credential: { type: 'oauth', accessToken: 'access-1' },
      revoke: ['access-1'],
      kept: 'access-1',
    },
  ] satisfies Array<{
    failure: string
    credential: Credential
    revoke: Array<string>
    kept: string | null
  }>)(
    'drops the tools and asks the user to run /connect when $failure',
    async ({ credential, revoke, kept }) => {
      const { server, credentials, host } = await setup(credential)
      for (const token of revoke) server.revoke(token)
      const model = recorder()
      const session = await openDemo(host, server.url, model)
      const seen = await promptAndCollect(session, 'hi')
      expect(model.toolNames(0)).toEqual([])
      expect(customValues(seen, 'harness.plugin.warning')).toEqual([
        {
          plugin: 'connector/demo',
          message: 'Sign in to demo first. Run /connect demo.',
        },
      ])
      // The notice has no URL: outside /connect, no browser sign-in starts.
      expect(customValues(seen, HARNESS_EVENTS.authRequired)).toEqual([
        { connector: 'demo' },
      ])
      // The same turn tells the model that the user must run /connect.
      expect(JSON.stringify(model.calls[0]?.systemPrompts)).toContain(
        'run /connect demo',
      )
      const saved = await credentials.get({
        scope,
        id: 'demo',
      })
      expect(saved?.type === 'oauth' ? saved.accessToken : null).toBe(kept)
    },
  )

  it('keeps a token that another session saved while its refresh failed', async () => {
    const { server, credentials, host } = await setup({
      type: 'oauth',
      accessToken: 'stale',
      refreshToken: 'revoked',
    })
    // Another session refreshes and saves its new token while the server
    // refuses this session's refresh token.
    const racing: typeof fetch = async (input, init) => {
      const target = new URL(input instanceof Request ? input.url : input)
      if (target.pathname === '/token') {
        await credentials.set({
          scope,
          id: 'demo',
          credential: {
            type: 'oauth',
            accessToken: 'saved-by-other',
            refreshToken: 'refresh-other',
          },
        })
      }
      return fetch(input, init)
    }
    const session = await host.open(
      defineHarness({
        name: 'test/connector',
        adapter: recorder().adapter,
        plugins: () => [
          mcpConnector({
            id: 'demo',
            label: 'Demo',
            url: server.url,
            fetch: racing,
          }),
        ],
      }),
      { threadId: 't', user: { id: 'user-1' } },
    )
    await session.send('hi')
    expect(await credentials.get({ scope, id: 'demo' })).toMatchObject({
      accessToken: 'saved-by-other',
    })
  })

  it('asks for a sign-in, and saves nothing, when the user signs out while the SDK refreshes', async () => {
    const { server, credentials, host } = await setup({
      type: 'oauth',
      accessToken: 'stale',
      refreshToken: 'refresh-1',
    })
    // The user signs out while the refresh request is on its way.
    const signingOut: typeof fetch = async (input, init) => {
      const target = new URL(input instanceof Request ? input.url : input)
      if (target.pathname === '/token') {
        await credentials.delete({ scope, id: 'demo' })
      }
      return fetch(input, init)
    }
    const model = recorder()
    const session = await host.open(
      defineHarness({
        name: 'test/connector',
        adapter: model.adapter,
        plugins: () => [
          mcpConnector({
            id: 'demo',
            label: 'Demo',
            url: server.url,
            fetch: signingOut,
          }),
        ],
      }),
      { threadId: 't', user: { id: 'user-1' } },
    )

    const seen = await promptAndCollect(session, 'hi')

    expect(model.toolNames(0)).toEqual([])
    expect(customValues(seen, HARNESS_EVENTS.authRequired)).toEqual([
      { connector: 'demo' },
    ])
    expect(await credentials.get({ scope, id: 'demo' })).toBeNull()
  })

  it('saves one refreshed token when two sessions refresh at once', async () => {
    const server = await startProtectedServer()
    cleanups.push(() => server.close())
    const store = memoryCredentialStore()
    await store.set({
      scope,
      id: 'demo',
      credential: {
        type: 'oauth',
        accessToken: 'stale',
        refreshToken: 'refresh-1',
        // With the issuer, so the SDK saves no tokens only to add it.
        client: { clientId: 'client-1', issuer: server.issuer },
      },
    })
    // Count the saves that change the store.
    let writes = 0
    const credentials = {
      ...store,
      set: async (entry: Parameters<typeof store.set>[0]) => {
        writes++
        await store.set(entry)
      },
      setIf: async (entry: Parameters<NonNullable<typeof store.setIf>>[0]) => {
        const saved = await store.setIf!(entry)
        if (saved.ok) writes++
        return saved
      },
    }
    // Hold each refresh request until both sessions sent theirs.
    let requests = 0
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const holding: typeof fetch = async (input, init) => {
      const target = new URL(input instanceof Request ? input.url : input)
      if (target.pathname === '/token') {
        requests++
        await held
      }
      return fetch(input, init)
    }
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      credentials,
    })
    cleanups.push(() => host.close())
    const harness = defineHarness({
      name: 'test/connector',
      adapter: recorder().adapter,
      plugins: () => [
        mcpConnector({
          id: 'demo',
          label: 'Demo',
          url: server.url,
          fetch: holding,
        }),
      ],
    })
    const sessions = await Promise.all(
      ['t1', 't2'].map((threadId) =>
        host.open(harness, { threadId, user: { id: 'user-1' } }),
      ),
    )
    const sending = Promise.all(sessions.map((session) => session.send('hi')))
    await vi.waitFor(() => expect(requests).toBe(2), { timeout: 5000 })
    release()
    await sending
    // The second save sees that the token changed, and keeps it.
    expect(writes).toBe(1)
    expect(await store.get({ scope, id: 'demo' })).toMatchObject({
      accessToken: 'access-2',
      refreshToken: 'refresh-1',
    })
  })

  it('keeps the sign-in and a connection error when the network is down', async () => {
    const { server, credentials, host } = await setup({
      type: 'oauth',
      accessToken: 'access-1',
    })
    const model = recorder()
    const session = await host.open(
      defineHarness({
        name: 'test/offline',
        adapter: model.adapter,
        plugins: () => [
          mcpConnector({
            id: 'demo',
            label: 'Demo',
            url: server.url,
            // Each request fails the way `fetch` fails without a network.
            fetch: async () => {
              throw new TypeError('fetch failed')
            },
          }),
        ],
      }),
      {
        threadId: 't',
        user: { id: 'user-1' },
      },
    )
    const seen = await promptAndCollect(session, 'hi')
    expect(model.toolNames(0)).toEqual([])
    expect(customValues(seen, 'harness.plugin.warning')).toEqual([
      { plugin: 'connector/demo', message: 'Failed to connect to MCP server' },
    ])
    expect(customValues(seen, HARNESS_EVENTS.authRequired)).toEqual([])
    expect(JSON.stringify(model.calls[0]?.systemPrompts ?? [])).not.toContain(
      'is not connected',
    )
    expect(await credentials.get({ scope, id: 'demo' })).toEqual({
      type: 'oauth',
      accessToken: 'access-1',
    })
  })
})

describe('mcpConnector /connect', () => {
  it('asks for scopes, shows the client name, and uses the prefix and approval rule', async () => {
    const { server, credentials, host } = await setup()
    const model = recorder()
    const session = await host.open(
      defineHarness({
        name: 'test/options',
        adapter: model.adapter,
        plugins: () => [
          mcpConnector({
            id: 'demo',
            label: 'Demo',
            url: server.url,
            prefix: 'd',
            scopes: ['read'],
            clientName: 'Acme Agent',
            needsApproval: () => true,
            fetch: (input, init) => fetch(input, init),
          }),
        ],
      }),
      {
        threadId: 't',
        user: { id: 'user-1' },
      },
    )
    const browser = approveSignIns(session, 'code-1')
    cleanups.push(browser.stop)

    expect(await session.runCommand({ name: 'connect:demo' })).toBe(
      'Connected to Demo.',
    )
    expect(browser.authorizationUrls[0]?.searchParams.get('scope')).toBe('read')
    expect(server.seen.registrations[0]).toMatchObject({
      client_name: 'Acme Agent',
      scope: 'read',
    })
    expect(await credentials.get({ scope, id: 'demo' })).toMatchObject({
      scopes: ['read', 'write'],
      client: {
        clientId: 'client-1',
        redirectUri: expect.stringContaining('127.0.0.1'),
      },
    })

    await session.send('hi')
    expect(model.toolNames(0)).toEqual(['d_echo'])
    expect(model.calls[0]?.tools?.[0]?.needsApproval).toBe(true)
  })

  it.each([
    { before: 'no earlier sign-in', earlier: undefined },
    {
      before: 'an earlier sign-in',
      // Maybe another account, with a larger scope. None of it may stay.
      earlier: {
        type: 'oauth',
        accessToken: 'old',
        refreshToken: 'refresh-0',
        expiresAt: Date.now() + 3_600_000,
        scopes: ['admin'],
        client: { clientId: 'client-0', redirectUri: 'http://127.0.0.1:1/cb' },
      },
    },
  ] satisfies Array<{ before: string; earlier: Credential | undefined }>)(
    'saves only the new sign-in, which gives no refresh token, after $before',
    async ({ earlier }) => {
      const { credentials, host, server } = await setup(earlier)
      const session = await openDemo(host, server.url)
      const browser = approveSignIns(session, 'code-2')
      cleanups.push(browser.stop)

      expect(await session.runCommand({ name: 'connect:demo' })).toBe(
        'Connected to Demo.',
      )
      expect(await credentials.get({ scope, id: 'demo' })).toEqual({
        type: 'oauth',
        accessToken: 'access-1',
        client: {
          clientId: 'client-1',
          redirectUri: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\//),
          issuer: server.issuer,
        },
      })
    },
  )

  it('saves the issuer, and signs in and refreshes without SEP-2352 warnings', async () => {
    // The SDK prints its SEP-2352 warnings with console.warn.
    const warn = vi.spyOn(console, 'warn')
    cleanups.push(() => warn.mockRestore())
    const { server, credentials, host } = await setup()
    const model = recorder()
    const session = await openDemo(host, server.url, model)
    const browser = approveSignIns(session, 'code-1')
    cleanups.push(browser.stop)
    expect(await session.runCommand({ name: 'connect:demo' })).toBe(
      'Connected to Demo.',
    )

    // The server stops taking the first token, so the next turn refreshes it.
    server.revoke('access-1')
    await session.send('hi')
    expect(model.toolNames(0)).toEqual(['demo_echo'])
    expect(
      server.seen.tokenRequests.map((form) => form.get('grant_type')),
    ).toEqual(['authorization_code', 'refresh_token'])
    expect(await credentials.get({ scope, id: 'demo' })).toMatchObject({
      accessToken: 'access-2',
      refreshToken: 'refresh-1',
      client: { clientId: 'client-1', issuer: server.issuer },
    })
    const warnings = warn.mock.calls.map(([message]) => String(message))
    expect(warnings.filter((message) => message.includes('SEP-2352'))).toEqual(
      [],
    )
  })

  it('stops its OAuth requests when the command is cancelled', async () => {
    const { server, host } = await setup()
    let requested: () => void = () => {}
    const firstRequest = new Promise<void>((resolve) => {
      requested = resolve
    })
    const session = await host.open(
      defineHarness({
        name: 'test/cancel',
        adapter: recorder().adapter,
        plugins: () => [
          mcpConnector({
            id: 'demo',
            label: 'Demo',
            url: server.url,
            // The server never answers: only the signal ends a request.
            fetch: (_input, init) =>
              new Promise<Response>((_, reject) => {
                requested()
                const signal = init?.signal
                if (signal?.aborted) return reject(signal.reason)
                signal?.addEventListener('abort', () => reject(signal.reason))
              }),
          }),
        ],
      }),
      { threadId: 't', user: { id: 'user-1' } },
    )
    const connecting = session.runCommand({ name: 'connect:demo' })
    await firstRequest
    await connecting.cancel()
    await expect(connecting).rejects.toBeDefined()
    expect(connecting.status()).toBe('cancelled')
  })

  it('passes the iss of the callback on, for a server that sends one (RFC 9207)', async () => {
    const { server, credentials, host } = await setup(undefined, {
      issParameter: true,
    })
    const session = await openDemo(host, server.url, recorder())
    const browser = approveSignIns(session, 'code-1', server.issuer)
    cleanups.push(browser.stop)
    expect(await session.runCommand({ name: 'connect:demo' })).toBe(
      'Connected to Demo.',
    )
    expect(await credentials.get({ scope, id: 'demo' })).toMatchObject({
      accessToken: 'access-1',
    })
  })

  it.each([
    { before: 'no sign-in', earlier: undefined, tools: [], asks: true },
    {
      before: 'the earlier sign-in',
      earlier: {
        type: 'oauth',
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        client: { clientId: 'client-1', redirectUri: 'http://127.0.0.1:1/cb' },
      },
      tools: ['demo_echo'],
      asks: false,
    },
  ] satisfies Array<{
    before: string
    earlier: Credential | undefined
    tools: Array<string>
    asks: boolean
  }>)(
    'keeps $before when a new sign-in fails',
    async ({ earlier, tools, asks }) => {
      const { credentials, host, server } = await setup(earlier)
      const model = recorder()
      const session = await openDemo(host, server.url, model)
      const browser = approveSignIns(session, 'wrong-code')
      cleanups.push(browser.stop)

      await expect(
        session.runCommand({ name: 'connect:demo' }),
      ).rejects.toMatchObject({
        code: 'invalid_grant',
      })
      expect(await credentials.get({ scope, id: 'demo' })).toEqual(
        earlier ?? null,
      )
      await session.send('hi')
      expect(model.toolNames(0)).toEqual(tools)
      expect(
        JSON.stringify(model.calls[0]?.systemPrompts ?? []).includes(
          'run /connect demo',
        ),
      ).toBe(asks)
    },
  )
})

describe('mcpConnector stored credential shapes', () => {
  it('works with a bare token, reuses the tools, and signs out before any tool call', async () => {
    const { server, credentials, host } = await setup({
      type: 'oauth',
      accessToken: 'access-1',
    })
    const model = recorder()
    const session = await openDemo(host, server.url, model)
    await session.send('one')
    await session.send('two')
    expect(model.toolNames(0)).toEqual(['demo_echo'])
    expect(model.toolNames(1)).toEqual(['demo_echo'])

    const fresh = await openDemo(host, server.url, recorder(), 't2')
    expect(await fresh.runCommand({ name: 'disconnect:demo' })).toBe(
      'Disconnected from Demo.',
    )
    expect(await credentials.get({ scope, id: 'demo' })).toBeNull()
  })

  it('refreshes a token saved without a client, and keeps a client secret', async () => {
    const bare = await setup({
      type: 'oauth',
      accessToken: 'stale',
      refreshToken: 'refresh-1',
    })
    const model = recorder()
    const session = await openDemo(bare.host, bare.server.url, model)
    await session.send('hi')
    expect(model.toolNames(0)).toEqual(['demo_echo'])
    const saved = await bare.credentials.get({
      scope,
      id: 'demo',
    })
    expect(saved).toMatchObject({
      accessToken: 'access-2',
      refreshToken: 'refresh-1',
    })
    // No saved client: the SDK registered one before it refreshed.
    expect(bare.server.seen.registrations).toHaveLength(1)
    expect(saved).toMatchObject({ client: { clientId: 'client-1' } })

    const withSecret = await setup({
      type: 'oauth',
      accessToken: 'stale',
      refreshToken: 'refresh-1',
      client: { clientId: 'client-1', clientSecret: 'secret-1' },
    })
    const other = await openDemo(withSecret.host, withSecret.server.url)
    await other.send('hi')
    expect(
      await withSecret.credentials.get({
        scope,
        id: 'demo',
      }),
    ).toMatchObject({
      accessToken: 'access-2',
      client: { clientId: 'client-1', clientSecret: 'secret-1' },
    })
  })

  it('treats a saved API key as no sign-in for the MCP server', async () => {
    const { server, host } = await setup({
      type: 'api_key',
      value: 'not-oauth',
    })
    const model = recorder()
    const session = await openDemo(host, server.url, model)
    await session.send('hi')
    expect(model.toolNames(0)).toEqual([])
  })
})

describe('mcpConnector client options', () => {
  it('names the tools with toolName', async () => {
    const { server, host } = await setup({
      type: 'oauth',
      accessToken: 'access-1',
    })
    const model = recorder()
    const session = await host.open(
      defineHarness({
        name: 'test/tool-name',
        adapter: model.adapter,
        plugins: () => [
          mcpConnector({
            id: 'demo',
            label: 'Demo',
            url: server.url,
            toolName: (tool) => `mcp__demo__${tool.name}`,
          }),
        ],
      }),
      {
        threadId: 't',
        user: { id: 'user-1' },
      },
    )
    await session.send('hi')
    expect(model.toolNames(0)).toEqual(['mcp__demo__echo'])
  })

  it('sends requestOptions with each MCP request', async () => {
    const { server, host } = await setup({
      type: 'oauth',
      accessToken: 'access-1',
    })
    const model = recorder()
    const held: Array<Promise<Response>> = []
    const session = await host.open(
      defineHarness({
        name: 'test/request-options',
        adapter: model.adapter,
        plugins: () => [
          mcpConnector({
            id: 'demo',
            label: 'Demo',
            url: server.url,
            requestOptions: { timeout: 50 },
            // Hold the tools/list answer for 500 ms, so only the 50 ms
            // timeout can end that request.
            fetch: (input, init) => {
              const response = fetch(input, init)
              const body = init?.body
              if (typeof body !== 'string' || !body.includes('"tools/list"')) {
                return response
              }
              const late = new Promise<void>((resolve) => {
                setTimeout(resolve, 500)
              }).then(() => response)
              held.push(late)
              return late
            },
          }),
        ],
      }),
      {
        threadId: 't',
        user: { id: 'user-1' },
      },
    )
    const seen = await promptAndCollect(session, 'hi')
    // Let the held answer finish before the server closes.
    await Promise.allSettled(held)
    expect(model.toolNames(0)).toEqual([])
    expect(customValues(seen, 'harness.plugin.warning')).toEqual([
      {
        plugin: 'connector/demo',
        message: expect.stringContaining('timed out'),
      },
    ])
  })
})
