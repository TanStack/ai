import { describe, expect, it, vi } from 'vitest'
import {
  MCPDuplicateToolNameError,
  MCPManager,
} from '../src/activities/chat/mcp/manager'
import type { ServerTool } from '../src'

function tool(name: string): ServerTool {
  return {
    __toolSide: 'server',
    name,
    description: '',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => 'ok',
  }
}

function source(tools: Array<ServerTool>, opts: { fail?: boolean } = {}) {
  const s = {
    closed: false,
    tools: async (_o?: { lazy?: boolean }) => {
      if (opts.fail) throw new Error('discovery failed')
      return tools
    },
    close: async () => {
      s.closed = true
    },
  }
  return s
}

describe('MCPManager', () => {
  it('no-op when built from undefined', async () => {
    const m = MCPManager.from(undefined)
    expect(await m.discover()).toEqual([])
    await m.dispose() // no throw
  })

  it('discover() merges tools and forwards lazyTools', async () => {
    const a = source([tool('a')])
    const b = source([tool('b')])
    const spyA = vi.spyOn(a, 'tools')
    const m = MCPManager.from({ clients: [a, b], lazyTools: true })
    expect((await m.discover()).map((t) => t.name)).toEqual(['a', 'b'])
    expect(spyA).toHaveBeenCalledWith({ lazy: true })
  })

  it('discover() throws MCPDuplicateToolNameError on collision', async () => {
    const m = MCPManager.from({
      clients: [source([tool('x')]), source([tool('x')])],
    })
    await expect(m.discover()).rejects.toBeInstanceOf(MCPDuplicateToolNameError)
  })

  it('default connection closes sources on dispose()', async () => {
    const a = source([tool('a')])
    const m = MCPManager.from({ clients: [a] })
    await m.discover()
    await m.dispose()
    expect(a.closed).toBe(true)
  })

  it("connection 'keep-alive' does NOT close on dispose()", async () => {
    const a = source([tool('a')])
    const m = MCPManager.from({ clients: [a], connection: 'keep-alive' })
    await m.discover()
    await m.dispose()
    expect(a.closed).toBe(false)
  })

  it('rethrows by default on discovery failure and self-cleans (close policy)', async () => {
    const a = source([tool('a')])
    const b = source([], { fail: true })
    const m = MCPManager.from({ clients: [a, b] }) // default close
    await expect(m.discover()).rejects.toThrow('discovery failed')
    expect(a.closed).toBe(true) // cleanup-on-failure
  })

  it('onDiscoveryError returning skips the failed source', async () => {
    const onDiscoveryError = vi.fn()
    const m = MCPManager.from({
      clients: [source([tool('a')]), source([], { fail: true })],
      onDiscoveryError,
    })
    expect((await m.discover()).map((t) => t.name)).toEqual(['a'])
    expect(onDiscoveryError).toHaveBeenCalledOnce()
  })

  it('onDiscoveryError throwing propagates', async () => {
    const m = MCPManager.from({
      clients: [source([], { fail: true })],
      onDiscoveryError: () => {
        throw new Error('abort')
      },
    })
    await expect(m.discover()).rejects.toThrow('abort')
  })
})
