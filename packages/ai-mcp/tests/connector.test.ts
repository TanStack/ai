import { afterEach, describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { mcpConnector } from '../src/connector'
import { approveSignIns, mockTextAdapter, recorder } from './connector-helpers'
import { startProtectedServer } from './protected-server'
import type { StreamChunk } from '@tanstack/ai'

/** A model that calls `tool` once, then answers with the tool result it saw. */
function modelCalling(tool: string, args: { text: string }) {
  let call = 0
  const now = () => Date.now()
  return mockTextAdapter((options) =>
    (async function* (): AsyncGenerator<StreamChunk> {
      call += 1
      yield {
        type: EventType.RUN_STARTED,
        runId: 'r',
        threadId: 't',
        timestamp: now(),
      }
      if (call === 1) {
        yield {
          type: EventType.TOOL_CALL_START,
          toolCallId: 'c1',
          toolCallName: tool,
          timestamp: now(),
        }
        yield {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: 'c1',
          delta: JSON.stringify(args),
          timestamp: now(),
        }
        yield {
          type: EventType.TOOL_CALL_END,
          toolCallId: 'c1',
          timestamp: now(),
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId: 'r',
          threadId: 't',
          timestamp: now(),
          metadata: { tanstack: { finishReason: 'tool_calls' } },
        }
        return
      }
      const last = options.messages.at(-1)
      const text = `saw: ${typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content)}`
      yield {
        type: EventType.TEXT_MESSAGE_START,
        messageId: `m${call}`,
        role: 'assistant',
        timestamp: now(),
      }
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: `m${call}`,
        delta: text,
        timestamp: now(),
      }
      yield {
        type: EventType.TEXT_MESSAGE_END,
        messageId: `m${call}`,
        timestamp: now(),
      }
      yield {
        type: EventType.RUN_FINISHED,
        runId: 'r',
        threadId: 't',
        timestamp: now(),
        metadata: { tanstack: { finishReason: 'stop' } },
      }
    })(),
  )
}

const cleanups: Array<() => unknown> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

describe('mcpConnector', () => {
  it('signs in with OAuth discovery, registration, and PKCE, then gives the model the server tools', async () => {
    const protectedServer = await startProtectedServer()
    cleanups.push(() => protectedServer.close())
    const persistence = memoryPersistence()
    const host = createHarnessHost({ persistence })
    cleanups.push(() => host.close())
    const harness = defineHarness({
      name: 'test/mcp-connector',
      adapter: modelCalling('demo_echo', { text: 'hello' }),
      plugins: () => [
        mcpConnector({ id: 'demo', label: 'Demo', url: protectedServer.url }),
      ],
    })
    const session = await host.open(harness, {
      threadId: 't',
      principal: { id: 'user-1' },
    })
    const browser = approveSignIns(session, 'code-1')
    cleanups.push(browser.stop)

    await expect(session.command('connect:demo')).resolves.toBe(
      'Connected to Demo.',
    )
    const authorizationUrl = browser.authorizationUrls.at(-1)
    expect(authorizationUrl?.searchParams.get('client_id')).toBe('client-1')
    expect(authorizationUrl?.searchParams.get('code_challenge_method')).toBe(
      'S256',
    )
    expect(
      new URL(authorizationUrl?.searchParams.get('redirect_uri') ?? '')
        .hostname,
    ).toBe('127.0.0.1')
    // No `scopes` option: the sign-in asks for no scope.
    expect(authorizationUrl?.searchParams.has('scope')).toBe(false)
    expect(protectedServer.seen.registrations).toHaveLength(1)
    expect(protectedServer.seen.registrations[0]).toMatchObject({
      client_name: 'TanStack AI Harness',
    })
    expect(protectedServer.seen.registrations[0]).not.toHaveProperty('scope')
    expect(
      protectedServer.seen.tokenRequests[0]?.get('code_verifier'),
    ).toBeTruthy()

    const saved = await persistence.stores.credentials.get(
      { threadId: 't', userId: 'user-1' },
      'demo',
    )
    expect(saved).toMatchObject({
      type: 'oauth',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      client: { clientId: 'client-1' },
    })

    // The echo tool is read-only, so the default rule runs it without approval.
    const turn = await session.prompt('echo hello')
    expect(turn.text).toContain('echo: hello')
    // The model never sees the token.
    expect(
      JSON.stringify(await persistence.stores.messages.loadThread('t')),
    ).not.toContain('access-1')

    await session.command('disconnect:demo')
    expect(
      await persistence.stores.credentials.get(
        { threadId: 't', userId: 'user-1' },
        'demo',
      ),
    ).toBeNull()
  })

  it('keeps one sign-in per sender in a shared thread', async () => {
    const protectedServer = await startProtectedServer()
    cleanups.push(() => protectedServer.close())
    const model = recorder()
    const persistence = memoryPersistence()
    const host = createHarnessHost({ persistence })
    cleanups.push(() => host.close())
    const alice = { id: 'alice' }
    const bob = { id: 'bob' }
    const session = await host.open(
      defineHarness({
        name: 'test/mcp-connector-shared',
        adapter: model.adapter,
        plugins: () => [
          mcpConnector({ id: 'demo', label: 'Demo', url: protectedServer.url }),
        ],
      }),
      { threadId: 't', principal: alice },
    )
    const browser = approveSignIns(session, 'code-1')
    cleanups.push(browser.stop)
    const savedFor = (userId: string) =>
      persistence.stores.credentials.get({ threadId: 't', userId }, 'demo')

    await session.command('connect:demo', undefined, { principal: bob })
    expect(await savedFor('bob')).not.toBeNull()
    expect(await savedFor('alice')).toBeNull()

    await session.prompt('hi', { principal: bob })
    await session.prompt('hi', { principal: alice })
    await session.prompt('hi', { principal: bob })
    // Only bob signed in, so only his turns get the server tools.
    expect(model.toolNames(0)).toEqual(['demo_echo'])
    expect(model.toolNames(1)).toEqual([])
    expect(JSON.stringify(model.calls[1]?.systemPrompts)).toContain(
      'run /connect demo',
    )
    expect(model.toolNames(2)).toEqual(['demo_echo'])

    // Alice signs in for her own turns.
    await session.command('connect:demo', undefined, { principal: alice })
    await session.prompt('hi', { principal: alice })
    expect(await savedFor('alice')).not.toBeNull()
    expect(model.toolNames(3)).toEqual(['demo_echo'])
  })

  it('keeps colliding sender names separate in one shared thread', async () => {
    const protectedServer = await startProtectedServer()
    cleanups.push(() => protectedServer.close())
    const first = { tenantId: 'a', id: 'b:c' }
    const second = { tenantId: 'a:b', id: 'c' }
    const persistence = memoryPersistence()
    for (const [principal, accessToken] of [
      [first, 'first-token'],
      [second, 'second-token'],
    ] as const) {
      await persistence.stores.credentials.set(
        { threadId: 't', tenantId: principal.tenantId, userId: principal.id },
        'demo',
        {
          type: 'oauth',
          accessToken,
          client: {
            clientId: 'client-1',
            redirectUri: 'http://127.0.0.1/callback',
            issuer: protectedServer.issuer,
          },
        },
      )
    }
    const initialized: Array<string> = []
    const toolLists: Array<string> = []
    const fetchForSender: typeof fetch = async (input, init) => {
      const request = new Request(input, init)
      const token = request.headers
        .get('authorization')
        ?.replace(/^Bearer /, '')
      const raw = request.method === 'POST' ? await request.clone().text() : ''
      const body: unknown = raw ? JSON.parse(raw) : undefined
      const method =
        typeof body === 'object' && body !== null && 'method' in body
          ? body.method
          : undefined
      if (method === 'initialize') initialized.push(token ?? '')
      if (method === 'tools/list') toolLists.push(token ?? '')
      if (token) request.headers.set('authorization', 'Bearer access-1')
      const response = await fetch(request)
      if (method !== 'tools/list' || !response.ok) return response
      const result: unknown = await response.json()
      if (
        typeof result !== 'object' ||
        result === null ||
        !('result' in result) ||
        typeof result.result !== 'object' ||
        result.result === null ||
        !('tools' in result.result) ||
        !Array.isArray(result.result.tools)
      ) {
        throw new Error('The MCP server did not return tools.')
      }
      for (const tool of result.result.tools) {
        if (typeof tool !== 'object' || tool === null || !('name' in tool)) {
          throw new Error('The MCP server returned an invalid tool.')
        }
        tool.name = token === 'first-token' ? 'first_echo' : 'second_echo'
      }
      return new Response(JSON.stringify(result), {
        status: response.status,
        headers: response.headers,
      })
    }
    const model = recorder()
    const host = createHarnessHost({ persistence })
    cleanups.push(() => host.close())
    const session = await host.open(
      defineHarness({
        name: 'test/mcp-connector-colliding-senders',
        adapter: model.adapter,
        plugins: () => [
          mcpConnector({
            id: 'demo',
            label: 'Demo',
            url: protectedServer.url,
            fetch: fetchForSender,
          }),
        ],
      }),
      { threadId: 't', principal: first },
    )
    await session.prompt('first', { principal: first })
    await session.prompt('second', { principal: second })
    await session.prompt('first again', { principal: first })
    expect(model.toolNames(0)).toEqual(['demo_first_echo'])
    expect(model.toolNames(1)).toEqual(['demo_second_echo'])
    expect(model.toolNames(2)).toEqual(['demo_first_echo'])
    expect(initialized).toEqual(['first-token', 'second-token'])
    expect(toolLists).toEqual(['first-token', 'second-token'])
  })

  it('tells the model to ask for /connect before sign-in', async () => {
    const model = recorder()
    const host = createHarnessHost({ persistence: memoryPersistence() })
    cleanups.push(() => host.close())
    const session = await host.open(
      defineHarness({
        name: 'test/mcp-connector-off',
        adapter: model.adapter,
        plugins: () => [
          mcpConnector({
            id: 'demo',
            label: 'Demo',
            url: 'http://127.0.0.1:9/mcp',
          }),
        ],
      }),
      { threadId: 't' },
    )
    await session.prompt('hi')
    expect(JSON.stringify(model.calls[0]?.systemPrompts)).toContain(
      'run /connect demo',
    )
    expect(model.toolNames(0)).toEqual([])
    expect(session.commands().map((command) => command.name)).toEqual([
      'connect:demo',
      'disconnect:demo',
    ])
  })
})
