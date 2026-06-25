import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MCPClient } from '../../src/client'
import type { MCPClients } from '../../src/pool'
import type { TransportConfig } from '../../src/transport'

const callToolMock = vi.fn(async () => ({
  content: [{ type: 'text', text: 'ok' }],
}))
const closeMock = vi.fn(async () => {})

// tools() returns ServerTool-like objects: at least `name` and optionally
// `metadata.mcp.serverToolName` (the UNPREFIXED server-native tool name).
type MockTool = {
  name: string
  metadata?: { mcp?: { serverToolName?: string } }
}
// Per-test variable so individual tests can override the exposed tool list.
let mockToolsList: Array<MockTool> = [{ name: 'place_order' }]

vi.mock('../../src/client', () => ({
  createMCPClient: vi.fn(async () => ({
    tools: async () => mockToolsList,
    callTool: callToolMock,
    close: closeMock,
  })),
}))

import { createMcpAppCallHandler } from '../../src/apps/call-handler'
import { createMCPClient } from '../../src/client'
import { inMemoryMcpSessionStore } from '../../src/apps/session-store'

type TransportDescriptor = TransportConfig
type ServerInfo = {
  transport: TransportDescriptor | undefined
  prefix: string | undefined
}

// A method the call handler must never reach in these tests. Calling it is a
// test bug, so it fails loudly instead of silently returning undefined.
function unreached(method: string) {
  return vi.fn(() => {
    throw new Error(`unexpected call to ${method}() in call-handler test`)
  })
}

// Fake pool. The handler only reads `getServers` from a pool (detected
// structurally via `'getServers' in entry`); the remaining members are present
// so the object genuinely satisfies MCPClients — no cast needed — but throw if
// ever exercised.
function fakePool(servers: Record<string, ServerInfo>): MCPClients {
  return {
    clients: {},
    tools: unreached('tools'),
    readResource: unreached('readResource'),
    getServers: () => servers,
    close: unreached('close'),
    [Symbol.asyncDispose]: unreached('asyncDispose'),
  }
}

// Fake single client. The handler only reads `getInfo`; the rest are real
// members that throw if reached.
function fakeClient(info: ServerInfo): MCPClient {
  return {
    capabilities: {},
    tools: unreached('tools'),
    resources: unreached('resources'),
    readResource: unreached('readResource'),
    resourceTemplates: unreached('resourceTemplates'),
    prompts: unreached('prompts'),
    getPrompt: unreached('getPrompt'),
    callTool: unreached('callTool'),
    getInfo: () => info,
    close: unreached('close'),
    [Symbol.asyncDispose]: unreached('asyncDispose'),
  }
}

const WEATHER_HTTP: ServerInfo = {
  transport: { type: 'http', url: 'https://x/mcp' },
  prefix: 'weather',
}

// The most common fixture: a handler over a single-server `weather` pool.
// `extra` threads through store/allowTool for the tests that need them.
function weatherPoolHandler(
  extra: Partial<Parameters<typeof createMcpAppCallHandler>[0]> = {},
) {
  return createMcpAppCallHandler({
    clients: fakePool({ weather: WEATHER_HTTP }),
    ...extra,
  })
}

describe('createMcpAppCallHandler', () => {
  beforeEach(() => {
    // Reset module-level mocks so tests don't depend on file order.
    callToolMock.mockClear()
    closeMock.mockClear()
    vi.mocked(createMCPClient).mockClear()
    mockToolsList = [{ name: 'place_order' }]
  })

  it('pool path: reconnects, enforces native-name allowlist, calls the tool, and closes', async () => {
    const handler = weatherPoolHandler()
    const res = await handler({
      threadId: 't1',
      serverId: 'weather',
      toolName: 'place_order',
      args: { qty: 1 },
    })
    expect(res).toEqual({ ok: true, result: expect.anything() })
    expect(createMCPClient).toHaveBeenCalledWith({
      transport: { type: 'http', url: 'https://x/mcp' },
      prefix: 'weather',
    })
    expect(callToolMock).toHaveBeenCalledWith('place_order', { qty: 1 })
    expect(closeMock).toHaveBeenCalled()
  })

  it('single-client path: defaults to the sole unnamed client when serverId is undefined', async () => {
    const handler = createMcpAppCallHandler({
      clients: fakeClient({
        transport: { type: 'http', url: 'https://x/mcp' },
        prefix: undefined,
      }),
    })
    const res = await handler({
      threadId: 't1',
      toolName: 'place_order',
    })
    expect(res).toEqual({ ok: true, result: expect.anything() })
    expect(callToolMock).toHaveBeenCalledWith('place_order', {})
    expect(closeMock).toHaveBeenCalled()
  })

  it('array-of-clients: merges a pool and a single client into one registry', async () => {
    const handler = createMcpAppCallHandler({
      clients: [
        fakePool({
          weather: {
            transport: { type: 'http', url: 'https://weather/mcp' },
            prefix: 'weather',
          },
        }),
        fakeClient({
          transport: { type: 'http', url: 'https://orders/mcp' },
          prefix: 'orders',
        }),
      ],
    })

    const viaPool = await handler({
      threadId: 't1',
      serverId: 'weather',
      toolName: 'place_order',
    })
    expect(viaPool).toEqual({ ok: true, result: expect.anything() })

    const viaClient = await handler({
      threadId: 't1',
      serverId: 'orders',
      toolName: 'place_order',
    })
    expect(viaClient).toEqual({ ok: true, result: expect.anything() })

    expect(createMCPClient).toHaveBeenCalledWith({
      transport: { type: 'http', url: 'https://weather/mcp' },
      prefix: 'weather',
    })
    expect(createMCPClient).toHaveBeenCalledWith({
      transport: { type: 'http', url: 'https://orders/mcp' },
      prefix: 'orders',
    })
  })

  it('rejects a tool the server does not expose (allowlist) without calling callTool', async () => {
    // Server only exposes 'place_order' (the beforeEach default), not
    // 'delete_everything'.
    const handler = weatherPoolHandler()
    const res = await handler({
      threadId: 't1',
      serverId: 'weather',
      toolName: 'delete_everything',
    })
    expect(res).toEqual({
      ok: false,
      error: expect.stringContaining('not allowed'),
    })
    // The disallowed tool must NOT be forwarded to the server...
    expect(callToolMock).not.toHaveBeenCalled()
    // ...but the client must still be closed in finally.
    expect(closeMock).toHaveBeenCalled()
  })

  it('matches the UNPREFIXED native name and forwards it UNCHANGED to callTool', async () => {
    // prefix `github`, native tool `github_search`: the widget sends the native
    // name, which must match and be forwarded VERBATIM (no prefix-strip).
    mockToolsList = [
      {
        name: 'github_github_search',
        metadata: { mcp: { serverToolName: 'github_search' } },
      },
    ]

    const handler = createMcpAppCallHandler({
      clients: fakePool({
        github: {
          transport: { type: 'http', url: 'https://x/mcp' },
          prefix: 'github',
        },
      }),
    })
    const res = await handler({
      threadId: 't1',
      serverId: 'github',
      toolName: 'github_search',
    })
    expect(res).toEqual({ ok: true, result: expect.anything() })
    expect(callToolMock).toHaveBeenCalledWith('github_search', {})
  })

  it('pool entry keyed by its prefix (≠ config key): widget serverId = prefix resolves and reconnects with that prefix', async () => {
    // The config key is `wx` but the server's prefix is `weather`. The widget
    // sends `serverId: weather` (the prefix), so the registry must key by the
    // prefix, NOT the config key.
    const handler = createMcpAppCallHandler({
      clients: fakePool({
        wx: {
          transport: { type: 'http', url: 'https://x/mcp' },
          prefix: 'weather',
        },
      }),
    })
    const res = await handler({
      threadId: 't1',
      serverId: 'weather',
      toolName: 'place_order',
    })
    expect(res).toEqual({ ok: true, result: expect.anything() })
    expect(createMCPClient).toHaveBeenCalledWith({
      transport: { type: 'http', url: 'https://x/mcp' },
      prefix: 'weather',
    })
    // The config key must NOT resolve, since the widget never sees it.
    expect(createMCPClient).not.toHaveBeenCalledWith(
      expect.objectContaining({ prefix: 'wx' }),
    )
  })

  it('throws at construction when two entries resolve to the same prefix', async () => {
    expect(() =>
      createMcpAppCallHandler({
        clients: [
          fakePool({
            a: {
              transport: { type: 'http', url: 'https://a/mcp' },
              prefix: 'dup',
            },
          }),
          fakeClient({
            transport: { type: 'http', url: 'https://b/mcp' },
            prefix: 'dup',
          }),
        ],
      }),
    ).toThrow(/duplicate serverId "dup"/)
  })

  it('throws at construction when more than one entry has no prefix', async () => {
    expect(() =>
      createMcpAppCallHandler({
        clients: [
          fakeClient({
            transport: { type: 'http', url: 'https://a/mcp' },
            prefix: undefined,
          }),
          fakeClient({
            transport: { type: 'http', url: 'https://b/mcp' },
            prefix: '',
          }),
        ],
      }),
    ).toThrow(/multiple clients without a prefix/)
  })

  it('falls back to the clients registry when the store returns null (store wins only when present)', async () => {
    // The store has no entry for this thread, so get() returns null. The
    // handler must fall back to the `clients` registry rather than rejecting.
    const store = inMemoryMcpSessionStore()
    const handler = weatherPoolHandler({ store })
    const res = await handler({
      threadId: 't-unknown',
      serverId: 'weather',
      toolName: 'place_order',
    })
    expect(res).toEqual({ ok: true, result: expect.anything() })
    // Reconnected from the registry's descriptor, not the (empty) store.
    expect(createMCPClient).toHaveBeenCalledWith({
      transport: { type: 'http', url: 'https://x/mcp' },
      prefix: 'weather',
    })
  })

  it('rejects an unknown serverId without connecting', async () => {
    const handler = createMcpAppCallHandler({ clients: fakePool({}) })
    const res = await handler({
      threadId: 't1',
      serverId: 'ghost',
      toolName: 'x',
    })
    expect(res).toEqual({
      ok: false,
      error: expect.stringContaining('serverId'),
    })
    // createMCPClient must NOT have been called (no connection for unknown server)
    expect(createMCPClient).not.toHaveBeenCalled()
  })

  it('resolves the descriptor via the store (store wins over clients)', async () => {
    const store = inMemoryMcpSessionStore()
    await store.set('t1', {
      weather: { transport: { type: 'http', url: 'https://store/mcp' } },
    })

    // The pool's transport (https://x/mcp) differs from the store's, proving
    // the store wins.
    const handler = weatherPoolHandler({ store })
    const res = await handler({
      threadId: 't1',
      serverId: 'weather',
      toolName: 'place_order',
    })
    expect(res).toEqual({ ok: true, result: expect.anything() })
    expect(createMCPClient).toHaveBeenCalledWith({
      transport: { type: 'http', url: 'https://store/mcp' },
      prefix: undefined,
    })
    expect(callToolMock).toHaveBeenCalledWith('place_order', {})
  })

  it('rejects when a custom allowTool returns false (without calling callTool)', async () => {
    const handler = weatherPoolHandler({ allowTool: () => false })
    const res = await handler({
      threadId: 't1',
      serverId: 'weather',
      toolName: 'place_order',
    })
    expect(res).toEqual({
      ok: false,
      error: expect.stringContaining('not allowed'),
    })
    expect(callToolMock).not.toHaveBeenCalled()
  })

  it('rejects a client whose descriptor has no reconnectable transport', async () => {
    const handler = createMcpAppCallHandler({
      // Built from a raw Transport: getInfo().transport is undefined.
      clients: fakeClient({ transport: undefined, prefix: undefined }),
    })
    const res = await handler({
      threadId: 't1',
      toolName: 'place_order',
    })
    expect(res).toEqual({
      ok: false,
      error: expect.stringContaining('no reconnectable transport descriptor'),
    })
    expect(createMCPClient).not.toHaveBeenCalled()
  })
})
