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
import type { Credential } from '@tanstack/ai-persistence'
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

async function setup(credential?: Credential) {
  const server = await startProtectedServer()
  cleanups.push(() => server.close())
  const persistence = memoryPersistence()
  if (credential)
    await persistence.stores.credentials.set(scope, 'demo', credential)
  const host = createHarnessHost({ persistence })
  cleanups.push(() => host.close())
  return { server, persistence, host }
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
    principal: { id: 'user-1' },
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
  await session.prompt(text)
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
    await session.prompt('echo')
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
      const { server, persistence, host } = await setup({
        type: 'oauth',
        accessToken: 'stale',
        refreshToken: 'refresh-1',
        expiresAt: Date.now() - 1000,
        client,
      })
      const model = recorder('demo_echo')
      const session = await openDemo(host, server.url, model)
      await session.prompt('echo')
      expect(model.toolNames(0)).toEqual(['demo_echo'])
      expect(
        server.seen.tokenRequests.map((form) => form.get('grant_type')),
      ).toEqual(['refresh_token'])
      expect(server.seen.registrations).toHaveLength(0)
      // A sign-in saved without an issuer gets the issuer of this server.
      expect(await persistence.stores.credentials.get(scope, 'demo')).toEqual({
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
      const { server, persistence, host } = await setup(credential)
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
      const saved = await persistence.stores.credentials.get(scope, 'demo')
      expect(saved?.type === 'oauth' ? saved.accessToken : null).toBe(kept)
    },
  )

  it('keeps the sign-in and a connection error when the network is down', async () => {
    const { server, persistence, host } = await setup({
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
      { threadId: 't', principal: { id: 'user-1' } },
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
    expect(await persistence.stores.credentials.get(scope, 'demo')).toEqual({
      type: 'oauth',
      accessToken: 'access-1',
    })
  })
})

describe('mcpConnector /connect', () => {
  it('asks for scopes, shows the client name, and uses the prefix and approval rule', async () => {
    const { server, persistence, host } = await setup()
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
      { threadId: 't', principal: { id: 'user-1' } },
    )
    const browser = approveSignIns(session, 'code-1')
    cleanups.push(browser.stop)

    expect(await session.command('connect:demo')).toBe('Connected to Demo.')
    expect(browser.authorizationUrls[0]?.searchParams.get('scope')).toBe('read')
    expect(server.seen.registrations[0]).toMatchObject({
      client_name: 'Acme Agent',
      scope: 'read',
    })
    expect(
      await persistence.stores.credentials.get(scope, 'demo'),
    ).toMatchObject({
      scopes: ['read', 'write'],
      client: {
        clientId: 'client-1',
        redirectUri: expect.stringContaining('127.0.0.1'),
      },
    })

    await session.prompt('hi')
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
      const { persistence, host, server } = await setup(earlier)
      const session = await openDemo(host, server.url)
      const browser = approveSignIns(session, 'code-2')
      cleanups.push(browser.stop)

      expect(await session.command('connect:demo')).toBe('Connected to Demo.')
      expect(await persistence.stores.credentials.get(scope, 'demo')).toEqual({
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
    const { server, persistence, host } = await setup()
    const model = recorder()
    const session = await openDemo(host, server.url, model)
    const browser = approveSignIns(session, 'code-1')
    cleanups.push(browser.stop)
    expect(await session.command('connect:demo')).toBe('Connected to Demo.')

    // The server stops taking the first token, so the next turn refreshes it.
    server.revoke('access-1')
    await session.prompt('hi')
    expect(model.toolNames(0)).toEqual(['demo_echo'])
    expect(
      server.seen.tokenRequests.map((form) => form.get('grant_type')),
    ).toEqual(['authorization_code', 'refresh_token'])
    expect(
      await persistence.stores.credentials.get(scope, 'demo'),
    ).toMatchObject({
      accessToken: 'access-2',
      refreshToken: 'refresh-1',
      client: { clientId: 'client-1', issuer: server.issuer },
    })
    const warnings = warn.mock.calls.map(([message]) => String(message))
    expect(warnings.filter((message) => message.includes('SEP-2352'))).toEqual(
      [],
    )
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
      const { persistence, host, server } = await setup(earlier)
      const model = recorder()
      const session = await openDemo(host, server.url, model)
      const browser = approveSignIns(session, 'wrong-code')
      cleanups.push(browser.stop)

      await expect(session.command('connect:demo')).rejects.toMatchObject({
        code: 'invalid_grant',
      })
      expect(await persistence.stores.credentials.get(scope, 'demo')).toEqual(
        earlier ?? null,
      )
      await session.prompt('hi')
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
    const { server, persistence, host } = await setup({
      type: 'oauth',
      accessToken: 'access-1',
    })
    const model = recorder()
    const session = await openDemo(host, server.url, model)
    await session.prompt('one')
    await session.prompt('two')
    expect(model.toolNames(0)).toEqual(['demo_echo'])
    expect(model.toolNames(1)).toEqual(['demo_echo'])

    const fresh = await openDemo(host, server.url, recorder(), 't2')
    expect(await fresh.command('disconnect:demo')).toBe(
      'Disconnected from Demo.',
    )
    expect(await persistence.stores.credentials.get(scope, 'demo')).toBeNull()
  })

  it('refreshes a token saved without a client, and keeps a client secret', async () => {
    const bare = await setup({
      type: 'oauth',
      accessToken: 'stale',
      refreshToken: 'refresh-1',
    })
    const model = recorder()
    const session = await openDemo(bare.host, bare.server.url, model)
    await session.prompt('hi')
    expect(model.toolNames(0)).toEqual(['demo_echo'])
    const saved = await bare.persistence.stores.credentials.get(scope, 'demo')
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
    await other.prompt('hi')
    expect(
      await withSecret.persistence.stores.credentials.get(scope, 'demo'),
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
    await session.prompt('hi')
    expect(model.toolNames(0)).toEqual([])
  })
})
