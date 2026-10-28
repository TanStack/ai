import { InMemoryTransport } from '@modelcontextprotocol/client'
import { Server } from '@modelcontextprotocol/server'
import { describe, expect, it } from 'vitest'
import { introspectFromTransport } from '../src/cli/introspect'
import {
  makeFullServer,
  makeServerWithLoopingCursor,
  makeServerWithPaginatedTools,
  makeServerWithWeatherTool,
} from './helpers/in-memory-server'

async function readOpened(
  opened: Promise<{
    server: { close: () => Promise<void> }
    clientTransport: Parameters<typeof introspectFromTransport>[0]
  }>,
) {
  const { server, clientTransport } = await opened
  try {
    return await introspectFromTransport(clientTransport)
  } finally {
    await server.close()
  }
}

describe('introspect', () => {
  it('reads the full server surface', async () => {
    const surface = await readOpened(makeFullServer())

    expect(surface.tools).toEqual([
      {
        name: 'get_weather',
        description: 'Get weather for a city',
        inputSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: {
            city: { type: 'string' },
          },
          required: ['city'],
        },
        outputSchema: undefined,
      },
    ])
    expect(surface.resources).toEqual([
      { uri: 'file:///hello.txt', name: 'hello' },
    ])
    expect(surface.prompts).toEqual([
      {
        name: 'review-code',
        arguments: [{ name: 'code', required: true }],
      },
    ])
    expect(surface.capabilities).toEqual({
      tools: { listChanged: true },
      resources: { listChanged: true },
      prompts: { listChanged: true },
    })
  })

  it('returns empty resources and prompts when the server does not list them', async () => {
    const surface = await readOpened(makeServerWithWeatherTool())

    expect(surface.tools.map((tool) => tool.name)).toEqual(['get_weather'])
    expect(surface.resources).toEqual([])
    expect(surface.prompts).toEqual([])
    expect(surface.capabilities).toEqual({
      tools: { listChanged: true },
    })
  })

  it('reads tools from every list page', async () => {
    const surface = await readOpened(makeServerWithPaginatedTools())

    expect(surface.tools).toEqual([
      {
        name: 'first_page_tool',
        description: 'On page one',
        inputSchema: { type: 'object' },
        outputSchema: undefined,
      },
      {
        name: 'second_page_tool',
        description: 'On page two',
        inputSchema: { type: 'object' },
        outputSchema: undefined,
      },
    ])
    expect(surface.resources).toEqual([])
    expect(surface.prompts).toEqual([])
  })

  it('throws when a list repeats a cursor', async () => {
    await expect(readOpened(makeServerWithLoopingCursor())).rejects.toThrow(
      'MCP list pagination repeated a cursor',
    )
  })

  it('reads tools from a server that only speaks the 2025 handshake', async () => {
    const server = new Server(
      { name: 'legacy', version: '1.0.0' },
      {
        capabilities: { tools: {} },
        supportedProtocolVersions: ['2025-11-25'],
      },
    )
    server.setRequestHandler('tools/list', () => ({
      tools: [
        {
          name: 'legacy_tool',
          description: 'Only on the 2025 handshake',
          inputSchema: { type: 'object' },
        },
      ],
    }))
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)

    const surface = await readOpened(
      Promise.resolve({ server, clientTransport }),
    )

    expect(surface.tools).toEqual([
      {
        name: 'legacy_tool',
        description: 'Only on the 2025 handshake',
        inputSchema: { type: 'object' },
        outputSchema: undefined,
      },
    ])
    expect(surface.resources).toEqual([])
    expect(surface.prompts).toEqual([])
    expect(surface.capabilities).toEqual({ tools: {} })
  })
})
