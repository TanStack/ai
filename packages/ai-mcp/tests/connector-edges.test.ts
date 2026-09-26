import { afterEach, describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  HARNESS_EVENTS,
  createHarnessHost,
  defineHarness,
} from '@tanstack/ai-harness'
import { mcpConnector } from '../src/connector'
import { startProtectedServer } from './protected-server'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import type { SessionEvent } from '@tanstack/ai-harness'

/** A model that records the tools it gets, calls `tool` once, then stops. */
function recorder(tool?: string) {
  const calls: Array<any> = []
  const now = () => Date.now()
  const adapter: AnyTextAdapter = {
    kind: 'text',
    name: 'mock',
    model: 'mock',
    '~types': {
      providerOptions: {} as Record<string, unknown>,
      inputModalities: ['text'] as readonly ['text'],
      messageMetadataByModality: {
        text: undefined as unknown,
        image: undefined as unknown,
        audio: undefined as unknown,
        video: undefined as unknown,
        document: undefined as unknown,
      },
      toolCapabilities: [] as ReadonlyArray<string>,
      toolCallMetadata: undefined as unknown,
      systemPromptMetadata: undefined as never,
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    chatStream: (options) => {
      calls.push(options)
      const first = calls.length === 1 && tool !== undefined
      return (async function* (): AsyncGenerator<StreamChunk> {
        yield {
          type: EventType.RUN_STARTED,
          runId: 'r',
          threadId: 't',
          timestamp: now(),
        }
        if (first) {
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: 'c1',
            toolCallName: tool,
            timestamp: now(),
          }
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: 'c1',
            delta: '{"text":"hi"}',
            timestamp: now(),
          }
          yield {
            type: EventType.TOOL_CALL_END,
            toolCallId: 'c1',
            timestamp: now(),
          }
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId: 'r',
          threadId: 't',
          timestamp: now(),
          metadata: {
            tanstack: { finishReason: first ? 'tool_calls' : 'stop' },
          },
        }
      })()
    },
  }
  const toolNames = (index: number) =>
    (calls[index]?.tools ?? []).map((entry: { name: string }) => entry.name)
  return { adapter, calls, toolNames }
}

const scope = { threadId: 't', userId: 'user-1' }
const cleanups: Array<() => unknown> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function setup(
  credential?: Parameters<
    ReturnType<typeof memoryPersistence>['stores']['credentials']['set']
  >[2],
) {
  const server = await startProtectedServer()
  cleanups.push(() => server.close())
  const persistence = memoryPersistence()
  if (credential)
    await persistence.stores.credentials.set(scope, 'demo', credential)
  const host = createHarnessHost({ persistence })
  cleanups.push(() => host.close())
  return { server, persistence, host }
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
    const session = await host.open(
      defineHarness({
        name: 'test/saved',
        adapter: model.adapter,
        plugins: () => [
          mcpConnector({ id: 'demo', label: 'Demo', url: server.url }),
        ],
      }),
      { threadId: 't', principal: { id: 'user-1' } },
    )
    await session.prompt('echo')
    expect(model.toolNames(0)).toEqual(['demo_echo'])
    expect(JSON.stringify(model.calls[1].messages)).toContain('echo: hi')
    // The status prompt is empty once connected.
    expect(JSON.stringify(model.calls[0].systemPrompts ?? [])).not.toContain(
      'is not connected',
    )
    expect(server.seen.registrations).toHaveLength(0)
  })

  it('refreshes an expired token and keeps the old refresh token and client', async () => {
    const { server, persistence, host } = await setup({
      type: 'oauth',
      accessToken: 'stale',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() - 1000,
      client: { clientId: 'client-1' },
    })
    const model = recorder('demo_echo')
    const session = await host.open(
      defineHarness({
        name: 'test/refresh',
        adapter: model.adapter,
        plugins: () => [
          mcpConnector({ id: 'demo', label: 'Demo', url: server.url }),
        ],
      }),
      { threadId: 't', principal: { id: 'user-1' } },
    )
    await session.prompt('echo')
    expect(model.toolNames(0)).toEqual(['demo_echo'])
    expect(
      server.seen.tokenRequests.some(
        (form) => form.get('grant_type') === 'refresh_token',
      ),
    ).toBe(true)
    expect(
      await persistence.stores.credentials.get(scope, 'demo'),
    ).toMatchObject({
      accessToken: 'access-2',
      refreshToken: 'refresh-1',
      client: { clientId: 'client-1' },
    })
  })

  it('drops the tools with a warning when the sign-in no longer works', async () => {
    const { server, host } = await setup({
      type: 'oauth',
      accessToken: 'stale',
      refreshToken: 'revoked',
    })
    const model = recorder()
    const session = await host.open(
      defineHarness({
        name: 'test/revoked',
        adapter: model.adapter,
        plugins: () => [
          mcpConnector({ id: 'demo', label: 'Demo', url: server.url }),
        ],
      }),
      { threadId: 't', principal: { id: 'user-1' } },
    )
    const seen: Array<SessionEvent> = []
    const controller = new AbortController()
    const reading = (async () => {
      for await (const entry of session.events({
        from: '0',
        signal: controller.signal,
      }))
        seen.push(entry)
    })()
    await session.prompt('hi')
    controller.abort()
    await reading
    expect(model.toolNames(0)).toEqual([])
    const warning = seen.find(
      (entry) =>
        entry.event.type === EventType.CUSTOM &&
        entry.event.name === 'harness.plugin.warning',
    )
    expect(warning?.event).toMatchObject({
      value: { plugin: 'connector/demo' },
    })
  })
})

describe('mcpConnector options', () => {
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
    const controller = new AbortController()
    let scopeParam: string | null = null
    void (async () => {
      for await (const entry of session.events({ signal: controller.signal })) {
        const event = entry.event
        if (
          event.type !== EventType.CUSTOM ||
          event.name !== HARNESS_EVENTS.authRequired
        )
          continue
        const url = new URL(String((event.value as { url: string }).url))
        scopeParam = url.searchParams.get('scope')
        const redirect = new URL(url.searchParams.get('redirect_uri') ?? '')
        redirect.searchParams.set('code', 'code-1')
        redirect.searchParams.set('state', url.searchParams.get('state') ?? '')
        await fetch(redirect)
      }
    })()
    cleanups.push(() => controller.abort())

    expect(await session.command('connect:demo')).toBe('Connected to Demo.')
    expect(scopeParam).toBe('read')
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
    expect(model.calls[0].tools[0].needsApproval).toBe(true)
  })
})

describe('mcpConnector stored credential shapes', () => {
  function connectorHarness(url: string, model: ReturnType<typeof recorder>) {
    return defineHarness({
      name: 'test/shapes',
      adapter: model.adapter,
      plugins: () => [mcpConnector({ id: 'demo', label: 'Demo', url })],
    })
  }

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
