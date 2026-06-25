import { describe, expect, it, vi } from 'vitest'
import {
  MCPDuplicateToolNameError,
  MCPManager,
} from '../src/activities/chat/mcp/manager'
import {
  executeServerTool,
  type ToolExecutionMiddlewareHooks,
} from '../src/activities/chat/tools/tool-calls'
import type { ServerTool } from '../src'
import type { CustomEvent, ToolCall, ToolExecutionContext } from '../src/types'

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

// ---------------------------------------------------------------------------
// MCP Apps: ui:// resource binding at discovery + eager-read emit (fail-soft)
// ---------------------------------------------------------------------------

/**
 * A tool that links a ui:// resource. The MCP discovery (in @tanstack/ai-mcp)
 * already stamps `metadata.mcp.uiResourceUri` + `serverId`. MCPManager.discover()
 * additionally binds the source's `readResource` so it travels to the emit site.
 */
function uiTool(name: string): ServerTool {
  return {
    __toolSide: 'server',
    name,
    description: '',
    inputSchema: { type: 'object', properties: {} },
    metadata: {
      mcp: {
        serverToolName: 'show',
        serverId: 'weather',
        uiResourceUri: 'ui://s/w',
      },
    },
    execute: async () => 'Processing',
  }
}

function uiSource(
  readResource: () => Promise<{
    contents: Array<{
      uri: string
      mimeType?: string
      text?: string
      blob?: string
    }>
  }>,
) {
  return {
    closed: false,
    tools: async (_o?: { lazy?: boolean }) => [uiTool('weather_show')],
    close: async () => {},
    readResource,
  }
}

/**
 * Drive the real server-tool execution/emit path with a tool, capturing any
 * CUSTOM events emitted via the same `emitCustomEvent` closure chat() wires in.
 */
async function runToolResult(
  tool: ServerTool,
  toolCallId: string,
  onEvent: (name: string, value: Record<string, unknown>) => void,
): Promise<void> {
  const toolCall: ToolCall = {
    id: toolCallId,
    type: 'function',
    function: { name: tool.name, arguments: '{}' },
  }
  const pendingEvents: Array<CustomEvent> = []
  const context = {
    toolCallId,
    context: undefined,
    // Mirrors the chat() closure: stamps toolCallId, pushes a CUSTOM chunk.
    emitCustomEvent: (eventName: string, value: Record<string, any>) => {
      pendingEvents.push({
        type: 'CUSTOM',
        name: eventName,
        value: { ...value, toolCallId },
      } as CustomEvent)
    },
  } as ToolExecutionContext<unknown>

  const results: Array<unknown> = []
  const hooks: ToolExecutionMiddlewareHooks | undefined = undefined
  const gen = executeServerTool(
    toolCall,
    tool,
    tool.name,
    {},
    context,
    pendingEvents,
    results as never,
    hooks,
  )
  // Drain the generator: collect emitted CUSTOM events.
  for await (const ev of gen) {
    onEvent(ev.name, ev.value as Record<string, unknown>)
  }
}

describe('MCPManager.discover — ui:// readResource binding', () => {
  it('binds the source readResource onto a ui-linked tool metadata', async () => {
    const readResource = vi.fn(async () => ({
      contents: [{ uri: 'ui://s/w', mimeType: 'text/html', text: '<b>x</b>' }],
    }))
    const m = MCPManager.from({ clients: [uiSource(readResource)] })
    const discovered = (await m.discover())[0]
    expect(discovered).toBeDefined()
    const mcp = (
      discovered?.metadata as {
        mcp?: { readResource?: (uri: string) => Promise<unknown> }
      }
    ).mcp
    expect(typeof mcp?.readResource).toBe('function')
  })

  it('does NOT bind readResource onto plain (non-ui) tools', async () => {
    const m = MCPManager.from({
      clients: [
        {
          tools: async () => [tool('plain')],
          close: async () => {},
          readResource: async () => ({ contents: [] }),
        },
      ],
    })
    const discovered = (await m.discover())[0]
    expect(discovered).toBeDefined()
    const mcp = (discovered?.metadata as { mcp?: { readResource?: unknown } })
      ?.mcp
    expect(mcp?.readResource).toBeUndefined()
  })
})

describe('executeServerTool — ui:// resource emit (MCP Apps)', () => {
  it('emits a ui-resource CUSTOM event when a tool links a ui:// resource', async () => {
    const emitted: Array<{ name: string; value: Record<string, unknown> }> = []
    const readResource = vi.fn(async () => ({
      contents: [{ uri: 'ui://s/w', mimeType: 'text/html', text: '<b>x</b>' }],
    }))
    // Replicate MCPManager.discover's binding: stamp readResource into metadata.
    const t = uiTool('weather_show')
    ;(t.metadata as { mcp: Record<string, unknown> }).mcp.readResource =
      readResource

    await runToolResult(t, 'call_1', (name, value) =>
      emitted.push({ name, value }),
    )

    expect(emitted).toContainEqual({
      name: 'ui-resource',
      value: {
        resource: { uri: 'ui://s/w', mimeType: 'text/html', text: '<b>x</b>' },
        serverId: 'weather',
        toolName: 'show',
        meta: undefined,
        toolCallId: 'call_1',
      },
    })
    expect(readResource).toHaveBeenCalledWith('ui://s/w')
  })

  it('emits nothing when no returned content matches the requested ui uri', async () => {
    const emitted: Array<unknown> = []
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Source returns unrelated contents — none whose uri === the linked uiUri.
    // Must NOT fall back to contents[0]; a mismatched widget is worse than none.
    const readResource = vi.fn(async () => ({
      contents: [
        { uri: 'ui://other/thing', mimeType: 'text/html', text: '<i>nope</i>' },
      ],
    }))
    const t = uiTool('weather_show')
    ;(t.metadata as { mcp: Record<string, unknown> }).mcp.readResource =
      readResource

    await runToolResult(t, 'call_1', () => emitted.push(1))

    expect(emitted).toHaveLength(0)
    expect(readResource).toHaveBeenCalledWith('ui://s/w')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('is fail-soft: read failure emits nothing and does not throw', async () => {
    const emitted: Array<unknown> = []
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const t = uiTool('weather_show')
    ;(t.metadata as { mcp: Record<string, unknown> }).mcp.readResource =
      async () => {
        throw new Error('boom')
      }

    await expect(
      runToolResult(t, 'call_1', () => emitted.push(1)),
    ).resolves.not.toThrow()

    expect(emitted).toHaveLength(0)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('does not emit a ui-resource event for a plain tool (no ui link)', async () => {
    const emitted: Array<unknown> = []
    await runToolResult(tool('plain'), 'call_1', () => emitted.push(1))
    expect(emitted).toHaveLength(0)
  })
})
