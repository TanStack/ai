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
import {
  InMemoryTransport,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/client'
import { Server } from '@modelcontextprotocol/server'
import { EventType, chat } from '@tanstack/ai'
import type { AdapterYieldChunk, AnyTextAdapter } from '@tanstack/ai'
import type { Transport } from '@modelcontextprotocol/client'
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
  const chatStream: AnyTextAdapter['chatStream'] = (options) => {
    const tools = options.tools ?? []
    onTools(tools.map((tool) => tool.name))
    return textEvents()
  }
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
    chatStream,
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  }
}

async function* textEvents(): AsyncGenerator<AdapterYieldChunk> {
  const timestamp = Date.now()
  yield {
    type: EventType.RUN_STARTED,
    runId: 'r1',
    threadId: 't1',
    timestamp,
  }
  yield {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'm1',
    role: 'assistant',
    timestamp,
  }
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'm1',
    delta: 'ok',
    timestamp,
  }
  yield {
    type: EventType.TEXT_MESSAGE_END,
    messageId: 'm1',
    timestamp,
  }
  yield {
    type: EventType.RUN_FINISHED,
    runId: 'r1',
    threadId: 't1',
    finishReason: 'stop',
    timestamp,
  }
}

async function drain(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _chunk of stream) {
    // discard
  }
}

async function runPoolChat(transport: Transport, connection?: 'keep-alive') {
  const pool = await createMCPClients({
    weather: { transport },
  })
  const closeSpy = vi.spyOn(pool, 'close')
  let seenTools: Array<string> = []
  const adapter = makeMockAdapter((names) => {
    seenTools = names
  })
  const stream = chat({
    adapter,
    messages: [{ role: 'user', content: 'hi' }],
    mcp: {
      clients: [pool],
      ...(connection === undefined ? {} : { connection }),
    },
  })
  await drain(stream)
  return { pool, closeSpy, seenTools }
}

describe('createMCPClients pool → chat({ mcp })', () => {
  it("discovers the pool's prefixed tools and closes the pool after the run", async () => {
    const { clientTransport } = await makeServerWithWeatherTool()
    const { seenTools, closeSpy } = await runPoolChat(clientTransport)

    // Pool tool was discovered + merged into the run (auto-prefixed by config key).
    expect(seenTools).toContain('weather_get_weather')
    // Default connection ('close') disposes the pool when the run drains.
    expect(closeSpy).toHaveBeenCalledTimes(1)
  })

  it("keep-alive: the pool is NOT closed when connection is 'keep-alive'", async () => {
    const { clientTransport } = await makeServerWithWeatherTool()
    const { closeSpy, pool } = await runPoolChat(clientTransport, 'keep-alive')

    expect(closeSpy).not.toHaveBeenCalled()
    await pool.close() // clean up the kept-alive connection
  })

  it('discovers tools from a spec 2026 server', async () => {
    const clientTransport = await makeModernWeatherTransport()
    const { seenTools, closeSpy } = await runPoolChat(clientTransport)

    expect(seenTools).toEqual(['weather_get_weather'])
    expect(closeSpy).toHaveBeenCalledTimes(1)
  })
})

// The server has no public setter for the negotiated era, so the test sets it.
async function makeModernWeatherTransport() {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  const server = new Server(
    { name: 'modern-weather', version: '1.0.0' },
    {
      capabilities: { tools: {} },
      supportedProtocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS, '2026-07-28'],
    },
  )
  Object.assign(server, { _negotiatedProtocolVersion: '2026-07-28' })
  server.setRequestHandler('tools/list', () => ({
    tools: [
      {
        name: 'get_weather',
        description: 'Get weather for a city',
        inputSchema: {
          type: 'object',
          properties: { city: { type: 'string' } },
        },
      },
    ],
  }))
  server.setRequestHandler('tools/call', () => ({
    content: [{ type: 'text' as const, text: 'Sunny' }],
  }))
  await server.connect(serverTransport)
  return clientTransport
}
