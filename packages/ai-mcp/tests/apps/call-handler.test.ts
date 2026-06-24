import { describe, expect, it, vi } from 'vitest'

const callToolMock = vi.fn(async () => ({
  content: [{ type: 'text', text: 'ok' }],
}))
const closeMock = vi.fn(async () => {})

// tools() returns an array of objects with at least a `name` property
// We use a per-test variable so individual tests can override it
let mockToolsList: Array<{ name: string }> = [{ name: 'place_order' }]

vi.mock('../../src/client', () => ({
  createMCPClient: vi.fn(async () => ({
    tools: async () => mockToolsList,
    callTool: callToolMock,
    close: closeMock,
  })),
}))

import { createMcpAppCallHandler } from '../../src/apps/call-handler'
import { createMCPClient } from '../../src/client'

describe('createMcpAppCallHandler', () => {
  it('reconnects, enforces same-server allowlist, calls the tool, and closes', async () => {
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

  it('rejects a tool the server does not expose (allowlist)', async () => {
    closeMock.mockClear()
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
    // Client must still be closed in finally
    expect(closeMock).toHaveBeenCalled()
  })
})
