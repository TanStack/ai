import { afterEach, describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { mcpConnector } from '../src/connector'
import {
  approveSignIns,
  authorizationUrlOf,
  recorder,
} from './connector-helpers'
import { startProtectedServer } from './protected-server'
import type { Credential } from '@tanstack/ai-persistence'
import type { HarnessSession, SessionEvent } from '@tanstack/ai-harness'

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
    const session = await host.open(connectorHarness(server.url, model), {
      threadId: 't',
      principal: { id: 'user-1' },
    })
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
      const session = await host.open(connectorHarness(server.url, model), {
        threadId: 't',
        principal: { id: 'user-1' },
      })
      await session.prompt('echo')
      expect(model.toolNames(0)).toEqual(['demo_echo'])
      expect(
        server.seen.tokenRequests.map((form) => form.get('grant_type')),
      ).toEqual(['refresh_token'])
      expect(server.seen.registrations).toHaveLength(0)
      expect(await persistence.stores.credentials.get(scope, 'demo')).toEqual({
        type: 'oauth',
        accessToken: 'access-2',
        refreshToken: 'refresh-1',
        client: { clientId: 'client-1', redirectUri },
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
    },
    {
      failure: 'the server revokes a token that has no refresh token',
      credential: { type: 'oauth', accessToken: 'access-1' },
      revoke: ['access-1'],
    },
  ] satisfies Array<{
    failure: string
    credential: Credential
    revoke: Array<string>
  }>)(
    'drops the tools with a warning, and keeps the sign-in, when $failure',
    async ({ credential, revoke }) => {
      const { server, persistence, host } = await setup(credential)
      for (const token of revoke) server.revoke(token)
      const model = recorder()
      const session = await host.open(connectorHarness(server.url, model), {
        threadId: 't',
        principal: { id: 'user-1' },
      })
      const seen = await promptAndCollect(session, 'hi')
      expect(model.toolNames(0)).toEqual([])
      const warning = seen.find(
        (entry) =>
          entry.event.type === EventType.CUSTOM &&
          entry.event.name === 'harness.plugin.warning',
      )
      expect(warning?.event).toMatchObject({
        value: { plugin: 'connector/demo' },
      })
      // Outside /connect, the connector never starts a browser sign-in.
      expect(
        seen.filter((entry) => authorizationUrlOf(entry.event) !== undefined),
      ).toEqual([])
      // Only /disconnect signs the user out.
      expect(
        await persistence.stores.credentials.get(scope, 'demo'),
      ).toMatchObject({ type: 'oauth', accessToken: credential.accessToken })
    },
  )
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
    { before: 'no earlier sign-in', earlier: undefined, kept: {} },
    {
      before: 'an earlier sign-in',
      earlier: { type: 'oauth', accessToken: 'old', refreshToken: 'refresh-0' },
      kept: { refreshToken: 'refresh-0' },
    },
  ] satisfies Array<{
    before: string
    earlier: Credential | undefined
    kept: { refreshToken?: string }
  }>)(
    'saves a sign-in that gives no refresh token after $before',
    async ({ earlier, kept }) => {
      const { persistence, host, server } = await setup(earlier)
      const session = await host.open(
        connectorHarness(server.url, recorder()),
        {
          threadId: 't',
          principal: { id: 'user-1' },
        },
      )
      const browser = approveSignIns(session, 'code-2')
      cleanups.push(browser.stop)

      expect(await session.command('connect:demo')).toBe('Connected to Demo.')
      expect(await persistence.stores.credentials.get(scope, 'demo')).toEqual({
        type: 'oauth',
        accessToken: 'access-1',
        ...kept,
        client: {
          clientId: 'client-1',
          redirectUri: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\//),
        },
      })
    },
  )

  it('stays signed out when the sign-in fails', async () => {
    const { persistence, host, server } = await setup()
    const model = recorder()
    const session = await host.open(connectorHarness(server.url, model), {
      threadId: 't',
      principal: { id: 'user-1' },
    })
    const browser = approveSignIns(session, 'wrong-code')
    cleanups.push(browser.stop)

    await expect(session.command('connect:demo')).rejects.toMatchObject({
      code: 'invalid_grant',
    })
    expect(await persistence.stores.credentials.get(scope, 'demo')).toBeNull()
    await session.prompt('hi')
    expect(JSON.stringify(model.calls[0]?.systemPrompts)).toContain(
      'run /connect demo',
    )
    expect(model.toolNames(0)).toEqual([])
  })
})

describe('mcpConnector stored credential shapes', () => {
  it('works with a bare token, reuses the tools, and signs out before any tool call', async () => {
    const { server, persistence, host } = await setup({
      type: 'oauth',
      accessToken: 'access-1',
    })
    const model = recorder()
    const session = await host.open(connectorHarness(server.url, model), {
      threadId: 't',
      principal: { id: 'user-1' },
    })
    await session.prompt('one')
    await session.prompt('two')
    expect(model.toolNames(0)).toEqual(['demo_echo'])
    expect(model.toolNames(1)).toEqual(['demo_echo'])

    const fresh = await host.open(connectorHarness(server.url, recorder()), {
      threadId: 't2',
      principal: { id: 'user-1' },
    })
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
    const session = await bare.host.open(
      connectorHarness(bare.server.url, model),
      {
        threadId: 't',
        principal: { id: 'user-1' },
      },
    )
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
    const other = await withSecret.host.open(
      connectorHarness(withSecret.server.url, recorder()),
      { threadId: 't', principal: { id: 'user-1' } },
    )
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
    const session = await host.open(connectorHarness(server.url, model), {
      threadId: 't',
      principal: { id: 'user-1' },
    })
    await session.prompt('hi')
    expect(model.toolNames(0)).toEqual([])
  })
})
