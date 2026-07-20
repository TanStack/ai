import { describe, expect, it, vi } from 'vitest'
import {
  MCPDuplicateToolNameError,
  MCPManager,
} from '../src/activities/chat/mcp/manager'
import {
  executeServerTool,
  type ToolResult,
} from '../src/activities/chat/tools/tool-calls'
import { EventType } from '../src/types'
import type { JSONSchema, ServerTool } from '../src'
import type {
  CustomEvent,
  ToolCall,
  ToolExecutionContext,
  UIResourceEvent,
} from '../src/types'

/**
 * The MCP-Apps metadata block that `@tanstack/ai-mcp` discovery stamps onto a
 * ui-linked tool. `MCPManager.discover()` additionally binds `readResource`.
 * Modeled explicitly here so tests can assign `readResource` without a cast —
 * `ServerTool.metadata` is `Record<string, any>` upstream.
 */
interface McpAppMetadata {
  mcp: {
    serverToolName?: string
    serverId?: string
    uiResourceUri?: string
    readResource?: (uri: string) => Promise<ReadResourceResult>
  }
}

interface ReadResourceResult {
  contents: Array<{
    uri: string
    mimeType?: string
    text?: string
    blob?: string
  }>
}

/** A ui-linked ServerTool whose `metadata.mcp` is statically typed. */
type TestServerTool = ServerTool<JSONSchema>

interface UiServerTool extends TestServerTool {
  metadata: McpAppMetadata
}

function tool(name: string): TestServerTool {
  return {
    __toolSide: 'server',
    name,
    description: '',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => 'ok',
  }
}

function source(tools: Array<TestServerTool>, opts: { fail?: boolean } = {}) {
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
function uiTool(name: string): UiServerTool {
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

/**
 * Read the `mcp` metadata block off a discovered tool. `AnyTool.metadata` is
 * `Record<string, any>` upstream, so the property access is already typed
 * `any` — annotating the return with the real shape documents what we read
 * without a cast.
 */
function readDiscoveredMcpMeta(
  tool: { metadata?: Record<string, any> } | undefined,
): McpAppMetadata['mcp'] | undefined {
  return tool?.metadata?.mcp
}

function uiSource(readResource: () => Promise<ReadResourceResult>) {
  return {
    closed: false,
    tools: async (_o?: { lazy?: boolean }) => [uiTool('weather_show')],
    close: async () => {},
    readResource,
  }
}

/** A CUSTOM event emitted by the tool, narrowed to the ui-resource value shape
 *  the MCP-Apps path produces (the only event these tests assert on). */
type EmittedEvent = { name: string; value: UIResourceEvent['value'] }

/**
 * Drive the real server-tool execution/emit path with a tool, capturing any
 * CUSTOM events emitted via the same `emitCustomEvent` closure chat() wires in.
 */
async function runToolResult(
  tool: TestServerTool,
  toolCallId: string,
  onEvent: (event: EmittedEvent) => void,
): Promise<Array<ToolResult>> {
  const toolCall: ToolCall = {
    id: toolCallId,
    type: 'function',
    function: { name: tool.name, arguments: '{}' },
  }
  const pendingEvents: Array<CustomEvent> = []
  const context: ToolExecutionContext<unknown> = {
    toolCallId,
    context: undefined,
    // Mirrors the chat() closure: stamps toolCallId, pushes a CUSTOM chunk.
    emitCustomEvent: (eventName, value) => {
      pendingEvents.push({
        type: EventType.CUSTOM,
        name: eventName,
        value: { ...value, toolCallId },
      })
    },
  }

  const results: Array<ToolResult> = []
  const gen = executeServerTool(
    toolCall,
    tool,
    tool.name,
    {},
    context,
    pendingEvents,
    results,
  )
  // Drain the generator: collect emitted CUSTOM events.
  for await (const ev of gen) {
    onEvent({ name: ev.name, value: ev.value })
  }
  // Return the tool results so callers can assert the normal tool-result still
  // flows even when the ui:// read fails (the fail-soft guarantee).
  return results
}

describe('MCPManager.discover — ui:// readResource binding', () => {
  it('binds the source readResource onto a ui-linked tool metadata', async () => {
    const readResource = vi.fn(async () => ({
      contents: [{ uri: 'ui://s/w', mimeType: 'text/html', text: '<b>x</b>' }],
    }))
    const m = MCPManager.from({ clients: [uiSource(readResource)] })
    const discovered = (await m.discover())[0]
    expect(discovered).toBeDefined()
    const mcp = readDiscoveredMcpMeta(discovered)
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
    const mcp = readDiscoveredMcpMeta(discovered)
    expect(mcp?.readResource).toBeUndefined()
  })
})

describe('executeServerTool — ui:// resource emit (MCP Apps)', () => {
  it('emits a ui-resource CUSTOM event when a tool links a ui:// resource', async () => {
    const emitted: Array<EmittedEvent> = []
    const readResource = vi.fn(async () => ({
      contents: [{ uri: 'ui://s/w', mimeType: 'text/html', text: '<b>x</b>' }],
    }))
    // Replicate MCPManager.discover's binding: stamp readResource into metadata.
    const t = uiTool('weather_show')
    t.metadata.mcp.readResource = readResource

    await runToolResult(t, 'call_1', (event) => emitted.push(event))

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
    t.metadata.mcp.readResource = readResource

    await runToolResult(t, 'call_1', () => emitted.push(1))

    expect(emitted).toHaveLength(0)
    expect(readResource).toHaveBeenCalledWith('ui://s/w')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('is fail-soft: read failure emits nothing, does not throw, and the tool result still flows', async () => {
    const emitted: Array<unknown> = []
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const t = uiTool('weather_show')
    t.metadata.mcp.readResource = async () => {
      throw new Error('boom')
    }

    const results = await runToolResult(t, 'call_1', () => emitted.push(1))

    expect(emitted).toHaveLength(0)
    expect(warn).toHaveBeenCalled()
    // The whole point of fail-soft: a broken widget must not swallow the model's
    // tool result. The tool's text output ('Processing') must still be present.
    expect(results.length).toBeGreaterThan(0)
    expect(JSON.stringify(results)).toContain('Processing')
    warn.mockRestore()
  })

  it('does not emit a ui-resource event for a plain tool (no ui link)', async () => {
    const emitted: Array<unknown> = []
    await runToolResult(tool('plain'), 'call_1', () => emitted.push(1))
    expect(emitted).toHaveLength(0)
  })
})
