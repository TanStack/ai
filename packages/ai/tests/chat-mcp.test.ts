import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { chat } from '../src/activities/chat/index'
import { MCPDuplicateToolNameError } from '../src/activities/chat/mcp/manager'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import type { StreamChunk } from '../src/types'
import type { MCPToolSource } from '../src/activities/chat/mcp/types'
import type { ServerTool } from '../src/activities/chat/tools/tool-definition'

// ============================================================================
// Fake MCP source factory
// ============================================================================

interface FakeSourceOpts {
  /** When true, tools() rejects with an error */
  fail?: boolean
  /** When true, tools() resolves but close() is counted separately */
  failClose?: boolean
}

function fakeSource(
  toolNames: ReadonlyArray<string>,
  opts?: FakeSourceOpts,
): MCPToolSource & {
  readonly closed: boolean
  readonly toolCallCount: number
} {
  let closed = false
  let toolCallCount = 0

  const source = {
    get closed() {
      return closed
    },
    get toolCallCount() {
      return toolCallCount
    },
    tools: (options?: { lazy?: boolean }): Promise<Array<ServerTool>> => {
      toolCallCount++
      if (opts?.fail) {
        return Promise.reject(
          new Error(`discovery failed for ${toolNames[0] ?? 'unknown'}`),
        )
      }
      const tools: Array<ServerTool> = toolNames.map(
        (name) =>
          ({
            __toolSide: 'server' as const,
            name,
            description: `MCP tool: ${name}`,
            execute: (_args: unknown) => ({ mcp: true, tool: name }),
          }) satisfies ServerTool,
      )
      // Spy-able: caller can inspect toolCallCount and options via the spy wrapping tools()
      void options // used by spy in lazyTools test
      return Promise.resolve(tools)
    },
    close: async (): Promise<void> => {
      closed = true
    },
  }
  return source
}

// ============================================================================
// Tests
// ============================================================================

describe('chat({ mcp })', () => {
  // --------------------------------------------------------------------------
  // Case 1: default connection:'close' closes every source after stream drains
  // --------------------------------------------------------------------------
  it('default connection closes sources after stream drains normally', async () => {
    const source = fakeSource(['mcpTool'])

    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('hi'),
          ev.textEnd(),
          ev.runFinished('stop'),
        ],
      ],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hello' }],
      mcp: { clients: [source] },
    })

    expect(source.closed).toBe(false)
    await collectChunks(stream as AsyncIterable<StreamChunk>)
    expect(source.closed).toBe(true)
  })

  // --------------------------------------------------------------------------
  // Case 2: connection:'keep-alive' does NOT close sources
  // --------------------------------------------------------------------------
  it("connection:'keep-alive' does not close sources", async () => {
    const source = fakeSource(['mcpTool'])

    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('hi'),
          ev.textEnd(),
          ev.runFinished('stop'),
        ],
      ],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hello' }],
      mcp: { clients: [source], connection: 'keep-alive' },
    })

    await collectChunks(stream as AsyncIterable<StreamChunk>)
    expect(source.closed).toBe(false)
  })

  // --------------------------------------------------------------------------
  // Case 3: close fires on ERROR (adapter throws) — source is closed
  // --------------------------------------------------------------------------
  it('source is closed when the adapter stream throws an error', async () => {
    const source = fakeSource(['mcpTool'])

    const { adapter } = createMockAdapter({
      chatStreamFn: () =>
        (async function* (): AsyncIterable<StreamChunk> {
          yield ev.runStarted()
          throw new Error('adapter boom')
        })(),
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hello' }],
      mcp: { clients: [source] },
    })

    await expect(
      collectChunks(stream as AsyncIterable<StreamChunk>),
    ).rejects.toThrow('adapter boom')

    expect(source.closed).toBe(true)
  })

  // --------------------------------------------------------------------------
  // Case 4: close fires on ABORT — source is closed after stream ends
  // --------------------------------------------------------------------------
  it('source is closed when the run is aborted mid-stream', async () => {
    const source = fakeSource(['mcpTool'])
    const abortController = new AbortController()

    const { adapter } = createMockAdapter({
      chatStreamFn: () =>
        (async function* (): AsyncIterable<StreamChunk> {
          yield ev.runStarted()
          yield ev.textStart()
          yield ev.textContent('chunk1')
          yield ev.textContent('chunk2')
          yield ev.textContent('chunk3')
          yield ev.textEnd()
          yield ev.runFinished('stop')
        })(),
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hello' }],
      mcp: { clients: [source] },
      abortController,
    })

    let count = 0
    for await (const _chunk of stream as AsyncIterable<StreamChunk>) {
      count++
      if (count === 2) {
        abortController.abort()
      }
    }

    // Stream drained (early) — the finally block must have run
    expect(source.closed).toBe(true)
  })

  // --------------------------------------------------------------------------
  // Case 5: discovered tools reach the run and execute
  // --------------------------------------------------------------------------
  it('discovered MCP tools are merged into the run and execute when called', async () => {
    const mcpExecuteSpy = vi.fn().mockReturnValue({ mcp: true, result: 'ok' })
    const source: MCPToolSource = {
      tools: async () => [
        {
          __toolSide: 'server' as const,
          name: 'mcpGetData',
          description: 'Fetches data via MCP',
          execute: mcpExecuteSpy,
        } satisfies ServerTool,
      ],
      close: async () => {},
    }

    const { adapter } = createMockAdapter({
      iterations: [
        // First iteration: model calls the MCP-discovered tool
        [
          ev.runStarted(),
          ev.toolStart('call_mcp', 'mcpGetData'),
          ev.toolArgs('call_mcp', '{"id":"42"}'),
          ev.runFinished('tool_calls'),
        ],
        // Second iteration: model produces final text
        [
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('Data fetched.'),
          ev.textEnd(),
          ev.runFinished('stop'),
        ],
      ],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'Get data' }],
      mcp: { clients: [source] },
    })

    const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

    // The MCP tool execute function ran
    expect(mcpExecuteSpy).toHaveBeenCalledTimes(1)
    expect(mcpExecuteSpy).toHaveBeenCalledWith(
      { id: '42' },
      expect.objectContaining({ toolCallId: 'call_mcp' }),
    )

    // There should be a tool result chunk in the stream
    const toolResultChunks = chunks.filter(
      (c) =>
        c.type === 'TOOL_CALL_RESULT' && 'content' in c && (c as any).content,
    )
    expect(toolResultChunks.length).toBeGreaterThanOrEqual(1)
  })

  // --------------------------------------------------------------------------
  // Case 6: lazyTools:true is forwarded to source.tools({ lazy: true })
  // --------------------------------------------------------------------------
  it('lazyTools:true is forwarded as { lazy: true } to source.tools()', async () => {
    const toolsSpy = vi.fn().mockResolvedValue([
      {
        __toolSide: 'server' as const,
        name: 'lazyMcpTool',
        description: 'lazy tool',
        execute: () => ({ ok: true }),
      } satisfies ServerTool,
    ])

    const source: MCPToolSource = {
      tools: toolsSpy,
      close: async () => {},
    }

    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('ok'),
          ev.textEnd(),
          ev.runFinished('stop'),
        ],
      ],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      mcp: { clients: [source], lazyTools: true },
    })

    await collectChunks(stream as AsyncIterable<StreamChunk>)

    expect(toolsSpy).toHaveBeenCalledTimes(1)
    expect(toolsSpy).toHaveBeenCalledWith({ lazy: true })
  })

  // --------------------------------------------------------------------------
  // Case 7a: onDiscoveryError returning skips failed source, run proceeds
  // --------------------------------------------------------------------------
  it('onDiscoveryError returning skips the failed source and run proceeds', async () => {
    const failingSource = fakeSource(['willFail'], { fail: true })
    const goodSource = fakeSource(['goodTool'])
    const errorHandler = vi.fn()

    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('ok'),
          ev.textEnd(),
          ev.runFinished('stop'),
        ],
      ],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      mcp: {
        clients: [failingSource, goodSource],
        onDiscoveryError: errorHandler,
      },
    })

    // Run completes without throwing
    const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)

    // Error handler was called for the failing source
    expect(errorHandler).toHaveBeenCalledTimes(1)
    expect(errorHandler.mock.calls[0]![0]).toBeInstanceOf(Error)
  })

  // --------------------------------------------------------------------------
  // Case 7b: onDiscoveryError throwing causes chat() to reject
  // --------------------------------------------------------------------------
  it('onDiscoveryError throwing causes chat() to reject', async () => {
    const failingSource = fakeSource(['willFail'], { fail: true })

    const { adapter } = createMockAdapter({
      iterations: [],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      mcp: {
        clients: [failingSource],
        onDiscoveryError: (_err: unknown) => {
          throw new Error('fatal discovery')
        },
      },
    })

    await expect(
      collectChunks(stream as AsyncIterable<StreamChunk>),
    ).rejects.toThrow('fatal discovery')
  })

  // --------------------------------------------------------------------------
  // Case 8a: Duplicate tool name across sources rejects with MCPDuplicateToolNameError
  // --------------------------------------------------------------------------
  it('duplicate MCP tool name rejects with MCPDuplicateToolNameError', async () => {
    const source1 = fakeSource(['sharedTool'])
    const source2 = fakeSource(['sharedTool'])

    const { adapter } = createMockAdapter({ iterations: [] })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      mcp: { clients: [source1, source2] },
    })

    await expect(
      collectChunks(stream as AsyncIterable<StreamChunk>),
    ).rejects.toBeInstanceOf(MCPDuplicateToolNameError)
  })

  // --------------------------------------------------------------------------
  // Case 8b: cleanup-on-failure — sources that connected are closed when discovery throws
  // --------------------------------------------------------------------------
  it('cleanup-on-failure: connected sources are closed when duplicate tool name is detected', async () => {
    const source1 = fakeSource(['dupTool'])
    const source2 = fakeSource(['dupTool'])

    const { adapter } = createMockAdapter({ iterations: [] })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      mcp: { clients: [source1, source2] },
    })

    await expect(
      collectChunks(stream as AsyncIterable<StreamChunk>),
    ).rejects.toBeInstanceOf(MCPDuplicateToolNameError)

    // The duplicate error triggers dispose() — both sources get closed
    expect(source1.closed).toBe(true)
    expect(source2.closed).toBe(true)
  })

  // --------------------------------------------------------------------------
  // Case 8c: cleanup-on-failure under default close when error is thrown directly
  // --------------------------------------------------------------------------
  it('cleanup-on-failure: sources that connected are closed when onDiscoveryError throws', async () => {
    const goodSource = fakeSource(['goodTool'])
    const failSource = fakeSource(['badTool'], { fail: true })

    const { adapter } = createMockAdapter({ iterations: [] })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      mcp: {
        clients: [goodSource, failSource],
        // No onDiscoveryError handler → fail-fast (throws)
      },
    })

    await expect(
      collectChunks(stream as AsyncIterable<StreamChunk>),
    ).rejects.toThrow('discovery failed')

    // goodSource connected and must be closed by cleanup-on-failure
    expect(goodSource.closed).toBe(true)
  })
})

// ============================================================================
// Structured-output runners + mcp
//
// chat() has THREE runners (streaming text, streaming structured output, and
// non-streaming/agentic structured output). The mcp wiring (discover → merge →
// dispose) lives in all of them, but the cases above only exercise the
// streaming-text runner. These pin the structured-output runners so the
// discovery/merge/close logic can't silently regress there.
// ============================================================================

describe('chat({ mcp }) — structured-output runners', () => {
  const OutSchema = z.object({ ok: z.boolean() })

  // A single chatStream turn that finishes without a tool call, so the agent
  // loop ends and the runner proceeds to structured-output finalization.
  const finishTurn = () => [
    ev.runStarted(),
    ev.textStart(),
    ev.textContent('{"ok":true}'),
    ev.textEnd(),
    ev.runFinished('stop'),
  ]

  it('streaming structured output (stream:true) discovers MCP tools and closes the source on drain', async () => {
    const source = fakeSource(['mcpTool'])
    const { adapter } = createMockAdapter({
      iterations: [finishTurn()],
      structuredOutput: async () => ({
        data: { ok: true },
        rawText: '{"ok":true}',
      }),
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'extract' }],
      outputSchema: OutSchema,
      stream: true,
      mcp: { clients: [source] },
    })

    await collectChunks(stream)

    expect(source.toolCallCount).toBe(1) // discovery ran in this runner
    expect(source.closed).toBe(true) // dispose ran in this runner
  })

  it('streaming structured output with keep-alive does NOT close the source', async () => {
    const source = fakeSource(['mcpTool'])
    const { adapter } = createMockAdapter({
      iterations: [finishTurn()],
      structuredOutput: async () => ({
        data: { ok: true },
        rawText: '{"ok":true}',
      }),
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'extract' }],
      outputSchema: OutSchema,
      stream: true,
      mcp: { clients: [source], connection: 'keep-alive' },
    })

    await collectChunks(stream)

    expect(source.closed).toBe(false)
  })

  it('non-streaming structured output (Promise) discovers MCP tools and closes the source', async () => {
    const source = fakeSource(['mcpTool'])
    const { adapter } = createMockAdapter({
      iterations: [finishTurn()],
      structuredOutput: async () => ({
        data: { ok: true },
        rawText: '{"ok":true}',
      }),
    })

    const result = await chat({
      adapter,
      messages: [{ role: 'user', content: 'extract' }],
      outputSchema: OutSchema,
      mcp: { clients: [source] },
    })

    expect(result).toEqual({ ok: true })
    expect(source.toolCallCount).toBe(1)
    expect(source.closed).toBe(true)
  })

  it('discovered MCP tool executes inside the structured-output agent loop', async () => {
    const mcpExecuteSpy = vi.fn().mockReturnValue({ mcp: true })
    const source: MCPToolSource = {
      tools: async () => [
        {
          __toolSide: 'server' as const,
          name: 'mcpDo',
          description: 'does a thing via MCP',
          execute: mcpExecuteSpy,
        } satisfies ServerTool,
      ],
      close: async () => {},
    }

    const { adapter } = createMockAdapter({
      iterations: [
        // Turn 1: the model calls the MCP-discovered tool.
        [
          ev.runStarted(),
          ev.toolStart('call_mcp', 'mcpDo'),
          ev.toolArgs('call_mcp', '{}'),
          ev.runFinished('tool_calls'),
        ],
        // Turn 2: the model finishes; finalization produces the structured output.
        finishTurn(),
      ],
      structuredOutput: async () => ({
        data: { ok: true },
        rawText: '{"ok":true}',
      }),
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'do it then summarize' }],
      outputSchema: OutSchema,
      stream: true,
      mcp: { clients: [source] },
    })

    await collectChunks(stream)

    expect(mcpExecuteSpy).toHaveBeenCalledTimes(1)
  })
})
