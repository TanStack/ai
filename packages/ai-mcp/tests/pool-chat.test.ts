/**
 * Integration: a real `createMCPClients(...)` pool passed into `chat({ mcp })`.
 *
 * The chat-side unit tests (packages/ai) cover the `MCPToolSource` contract with
 * fake sources, and `pool.test.ts` covers the pool's own `tools()`/`close()`.
 * This wires the two together end-to-end: a live in-memory MCP server pool
 * handed to `chat()` must have its (prefixed) tools discovered into the run and
 * its connections closed when the run drains — proving the pool genuinely
 * satisfies the `MCPToolSource` shape `chat({ mcp })` consumes.
 */
import { describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import type { AnyTextAdapter } from '@tanstack/ai'
import { createMCPClients } from '../src/pool'
import { makeServerWithWeatherTool } from './helpers/in-memory-server'

/**
 * Minimal text adapter: captures the tool names handed to `chatStream` (so we
 * can assert the pool's tools were discovered + merged) and emits a complete
 * AG-UI lifecycle so the engine finishes cleanly.
 */
function makeMockAdapter(
  onTools: (names: Array<string>) => void,
): AnyTextAdapter {
  return {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    '~types': {
      providerOptions: {},
      inputModalities: ['text'],
      messageMetadataByModality: {
        text: undefined,
        image: undefined,
        audio: undefined,
        video: undefined,
        document: undefined,
      },
      toolCapabilities: [],
      toolCallMetadata: undefined,
      systemPromptMetadata: undefined,
    },
    chatStream: (opts: { tools?: Array<{ name: string }> }) => {
      onTools((opts.tools ?? []).map((t) => t.name))
      return (async function* () {
        const ts = Date.now()
        yield {
          type: 'RUN_STARTED',
          runId: 'r1',
          threadId: 't1',
          timestamp: ts,
        }
        yield {
          type: 'TEXT_MESSAGE_START',
          messageId: 'm1',
          role: 'assistant',
          timestamp: ts,
        }
        yield {
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: 'm1',
          delta: 'ok',
          timestamp: ts,
        }
        yield { type: 'TEXT_MESSAGE_END', messageId: 'm1', timestamp: ts }
        yield {
          type: 'RUN_FINISHED',
          runId: 'r1',
          threadId: 't1',
          finishReason: 'stop',
          timestamp: ts,
        }
      })()
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  } as unknown as AnyTextAdapter
}

async function drain(stream: unknown): Promise<void> {
  for await (const _chunk of stream as AsyncIterable<unknown>) {
    // discard
  }
}

describe('createMCPClients pool → chat({ mcp })', () => {
  it("discovers the pool's prefixed tools and closes the pool after the run", async () => {
    const { clientTransport } = await makeServerWithWeatherTool()
    const pool = await createMCPClients({
      weather: { transport: clientTransport },
    })
    const closeSpy = vi.spyOn(pool, 'close')

    let seenTools: Array<string> = []
    const adapter = makeMockAdapter((names) => {
      seenTools = names
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      mcp: { clients: [pool] },
    })
    await drain(stream)

    // Pool tool was discovered + merged into the run (auto-prefixed by config key).
    expect(seenTools).toContain('weather_get_weather')
    // Default connection ('close') disposes the pool when the run drains.
    expect(closeSpy).toHaveBeenCalledTimes(1)
  })

  it("keep-alive: the pool is NOT closed when connection is 'keep-alive'", async () => {
    const { clientTransport } = await makeServerWithWeatherTool()
    const pool = await createMCPClients({
      weather: { transport: clientTransport },
    })
    const closeSpy = vi.spyOn(pool, 'close')
    const adapter = makeMockAdapter(() => {})

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      mcp: { clients: [pool], connection: 'keep-alive' },
    })
    await drain(stream)

    expect(closeSpy).not.toHaveBeenCalled()
    await pool.close() // clean up the kept-alive connection
  })
})
