import { beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('createMcpAppCallHandler', () => {
  beforeEach(() => {
    // Reset module-level mocks so tests don't depend on file order.
    callToolMock.mockClear()
    closeMock.mockClear()
    ;(createMCPClient as ReturnType<typeof vi.fn>).mockClear()
    mockToolsList = [{ name: 'place_order' }]
  })

  it('reconnects, enforces same-server allowlist, calls the tool, and closes', async () => {
    mockToolsList = [{ name: 'place_order' }]

    const handler = createMcpAppCallHandler({
      servers: {
        weather: { transport: { type: 'http', url: 'https://x/mcp' } },
      },
    })
    const res = await handler({
      threadId: 't1',
      serverId: 'weather',
      toolName: 'place_order',
      args: { qty: 1 },
    })
    expect(res).toEqual({ ok: true, result: expect.anything() })
    expect(closeMock).toHaveBeenCalled()
  })

  it('rejects an unknown serverId without connecting', async () => {
    ;(createMCPClient as ReturnType<typeof vi.fn>).mockClear()

    const handler = createMcpAppCallHandler({ servers: {} })
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

  it('rejects a tool the server does not expose (allowlist) without calling callTool', async () => {
    closeMock.mockClear()
    callToolMock.mockClear()
    // Server only exposes 'place_order', not 'delete_everything'
    mockToolsList = [{ name: 'place_order' }]

    const handler = createMcpAppCallHandler({
      servers: {
        weather: { transport: { type: 'http', url: 'https://x/mcp' } },
      },
    })
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

  it('matches the UNPREFIXED name for a prefixed server and forwards it to callTool', async () => {
    closeMock.mockClear()
    callToolMock.mockClear()
    // Exposed tools are prefixed (`weather_show_widget`) but carry the native
    // name on metadata.mcp.serverToolName. The widget sends the native name.
    mockToolsList = [
      {
        name: 'weather_show_widget',
        metadata: { mcp: { serverToolName: 'show_widget' } },
      },
    ]

    const handler = createMcpAppCallHandler({
      servers: {
        weather: {
          transport: { type: 'http', url: 'https://x/mcp' },
          prefix: 'weather',
        },
      },
    })
    const res = await handler({
      threadId: 't1',
      serverId: 'weather',
      toolName: 'show_widget',
      args: { city: 'NYC' },
    })
    expect(res).toEqual({ ok: true, result: expect.anything() })
    // callTool must receive the UNPREFIXED name the server actually knows.
    expect(callToolMock).toHaveBeenCalledWith('show_widget', { city: 'NYC' })
    expect(closeMock).toHaveBeenCalled()
  })

  it('does not strip a native name that happens to start with the prefix', async () => {
    // prefix `github`, native tool `github_search`: the widget sends the native
    // name, which must match and be forwarded UNCHANGED (no prefix-strip).
    mockToolsList = [
      {
        name: 'github_github_search',
        metadata: { mcp: { serverToolName: 'github_search' } },
      },
    ]

    const handler = createMcpAppCallHandler({
      servers: {
        github: {
          transport: { type: 'http', url: 'https://x/mcp' },
          prefix: 'github',
        },
      },
    })
    const res = await handler({
      threadId: 't1',
      serverId: 'github',
      toolName: 'github_search',
    })
    expect(res).toEqual({ ok: true, result: expect.anything() })
    // The native name must be forwarded verbatim, not stripped to `search`.
    expect(callToolMock).toHaveBeenCalledWith('github_search', {})
  })

  it('resolves the descriptor via the store (store wins over servers)', async () => {
    closeMock.mockClear()
    callToolMock.mockClear()
    mockToolsList = [{ name: 'place_order' }]

    const store = inMemoryMcpSessionStore()
    await store.set('t1', {
      weather: { transport: { type: 'http', url: 'https://x/mcp' } },
    })

    const handler = createMcpAppCallHandler({ store })
    const res = await handler({
      threadId: 't1',
      serverId: 'weather',
      toolName: 'place_order',
    })
    expect(res).toEqual({ ok: true, result: expect.anything() })
    expect(callToolMock).toHaveBeenCalledWith('place_order', {})
  })

  it('rejects when a custom allowTool returns false (without calling callTool)', async () => {
    closeMock.mockClear()
    callToolMock.mockClear()
    mockToolsList = [{ name: 'place_order' }]

    const handler = createMcpAppCallHandler({
      servers: {
        weather: { transport: { type: 'http', url: 'https://x/mcp' } },
      },
      allowTool: () => false,
    })
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

  it('defaults to the sole server when serverId is undefined', async () => {
    closeMock.mockClear()
    callToolMock.mockClear()
    mockToolsList = [{ name: 'place_order' }]

    const handler = createMcpAppCallHandler({
      servers: {
        weather: { transport: { type: 'http', url: 'https://x/mcp' } },
      },
    })
    const res = await handler({
      threadId: 't1',
      toolName: 'place_order',
    })
    expect(res).toEqual({ ok: true, result: expect.anything() })
    expect(callToolMock).toHaveBeenCalledWith('place_order', {})
  })

  it('rejects undefined serverId when multiple servers are configured', async () => {
    callToolMock.mockClear()
    ;(createMCPClient as ReturnType<typeof vi.fn>).mockClear()

    const handler = createMcpAppCallHandler({
      servers: {
        weather: { transport: { type: 'http', url: 'https://x/mcp' } },
        orders: { transport: { type: 'http', url: 'https://y/mcp' } },
      },
    })
    const res = await handler({
      threadId: 't1',
      toolName: 'place_order',
    })
    expect(res).toEqual({
      ok: false,
      error: expect.stringContaining('serverId'),
    })
    expect(createMCPClient).not.toHaveBeenCalled()
  })
})
