import { describe, expect, it } from 'vitest'
import {
  Client,
  InMemoryTransport,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import { Server } from '@modelcontextprotocol/server'
import {
  createTestEventsServer,
  eventsHttpFetch,
} from '../helpers/events-server'
import { passThroughSchema } from '../helpers/pass-through-schema'

const EVENTS_EXTENSION = 'io.modelcontextprotocol/events'
const serverUrl = new URL('https://mcp.example.com/mcp')

const listResultSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'tanstack-ai-mcp-test',
    validate(value: unknown) {
      return { value }
    },
  },
}

async function openInMemory(server: Server) {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return clientTransport
}

async function withHttpClient(
  fetchImpl: (request: Request) => Promise<Response>,
  hooks: {
    era: '2025' | '2026'
    capabilities?: Record<string, unknown>
    fetchSpy?: typeof fetch
  },
  run: (client: Client, seen: Array<Request>) => Promise<void>,
) {
  const seen: Array<Request> = []
  const versionNegotiation =
    hooks.era === '2026' ? { mode: { pin: '2026-07-28' as const } } : undefined
  const client = new Client(
    { name: 'tester', version: '1.0.0' },
    {
      versionNegotiation,
      capabilities: hooks.capabilities,
    },
  )
  const transport = new StreamableHTTPClientTransport(serverUrl, {
    fetch: async (input, init) => {
      const request = new Request(input, init)
      seen.push(request.clone())
      if (hooks.fetchSpy) return hooks.fetchSpy(input, init)
      return fetchImpl(request)
    },
  })
  await client.connect(transport)
  try {
    await run(client, seen)
  } finally {
    await client.close()
  }
}

describe('MCP SDK contract for Events', () => {
  it('keeps extensions["io.modelcontextprotocol/events"] in getServerCapabilities() over InMemoryTransport (2025 era)', async () => {
    const events = createTestEventsServer()
    const clientTransport = await openInMemory(events.server)
    const client = new Client(
      { name: 'tester', version: '1.0.0' },
      { versionNegotiation: { mode: 'legacy' } },
    )
    await client.connect(clientTransport)
    try {
      const caps = client.getServerCapabilities()
      expect(caps?.extensions?.[EVENTS_EXTENSION]).toEqual({})
    } finally {
      await client.close()
    }
  })

  it('drops a top-level "events" capability (documents why we read extensions)', async () => {
    const server = new Server(
      { name: 'legacy-events', version: '1.0.0' },
      // @ts-expect-error top-level events is stripped by ServerCapabilitiesSchema
      { capabilities: { events: {} } },
    )
    const clientTransport = await openInMemory(server)
    const client = new Client({ name: 'tester', version: '1.0.0' })
    await client.connect(clientTransport)
    try {
      const caps = client.getServerCapabilities() as
        | { events?: unknown; experimental?: unknown; extensions?: unknown }
        | undefined
      expect(caps?.events).toBeUndefined()
    } finally {
      await client.close()
    }
  })

  it('keeps capabilities.experimental.events as a JSON object', async () => {
    const server = new Server(
      { name: 'experimental-events', version: '1.0.0' },
      { capabilities: { experimental: { events: {} } } },
    )
    const clientTransport = await openInMemory(server)
    const client = new Client({ name: 'tester', version: '1.0.0' })
    await client.connect(clientTransport)
    try {
      const caps = client.getServerCapabilities()
      expect(caps?.experimental?.events).toEqual({})
    } finally {
      await client.close()
    }
  })

  it('routes a custom events/list request with a Standard Schema result over InMemoryTransport', async () => {
    const events = createTestEventsServer()
    const clientTransport = await openInMemory(events.server)
    const client = new Client({ name: 'tester', version: '1.0.0' })
    await client.connect(clientTransport)
    try {
      const result = await client.request(
        { method: 'events/list', params: {} },
        listResultSchema,
      )
      expect(result).toMatchObject({
        events: [{ name: 'incident.created', delivery: ['webhook'] }],
      })
    } finally {
      await client.close()
    }
  })

  it.each(['2025', '2026'] as const)(
    'routes events/list over Streamable HTTP in era %s',
    async (era) => {
      const events = createTestEventsServer()
      const fetchImpl = eventsHttpFetch(events)
      await withHttpClient(fetchImpl, { era }, async (client) => {
        const result = await client.request(
          { method: 'events/list', params: {} },
          listResultSchema,
        )
        expect(result).toMatchObject({
          events: [{ name: 'incident.created' }],
        })
      })
    },
  )

  it('declares client capability extensions["io.modelcontextprotocol/events"] = {}', async () => {
    const events = createTestEventsServer()
    const clientTransport = await openInMemory(events.server)
    const client = new Client(
      { name: 'tester', version: '1.0.0' },
      {
        capabilities: {
          extensions: { [EVENTS_EXTENSION]: {} },
        },
      },
    )
    await client.connect(clientTransport)
    try {
      await client.request(
        { method: 'events/list', params: {} },
        listResultSchema,
      )
      const captured = events.capturedClientCapabilities.at(-1) as
        | { extensions?: Record<string, unknown> }
        | undefined
      expect(captured?.extensions?.[EVENTS_EXTENSION]).toEqual({})
    } finally {
      await client.close()
    }
  })

  it('records whether the HTTP transport sends Mcp-Name for events/subscribe params.name', async () => {
    const events = createTestEventsServer()
    events.server.setRequestHandler(
      'events/subscribe',
      { params: passThroughSchema },
      async () => ({
        id: 'sub_1',
        refreshBefore: null,
        cursor: null,
        truncated: false,
      }),
    )
    const fetchImpl = eventsHttpFetch(events)
    const observed: Array<{ mcpName: string | null; method: unknown }> = []

    await withHttpClient(fetchImpl, { era: '2026' }, async (client, seen) => {
      try {
        await client.request(
          {
            method: 'events/subscribe',
            params: {
              name: 'incident.created',
              arguments: {},
              delivery: {
                mode: 'webhook',
                url: 'https://hooks.example.com/mcp',
                secret: 'whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
              },
              cursor: null,
            },
          },
          passThroughSchema,
        )
      } catch {
        // A 2026-era server may reject an unregistered custom method over HTTP.
        // The header observation still stands from the outbound request.
      }
      for (const request of seen) {
        const text = await request.clone().text()
        let method: unknown
        try {
          const json: unknown = JSON.parse(text)
          method =
            json !== null &&
            typeof json === 'object' &&
            'method' in json &&
            typeof json.method === 'string'
              ? json.method
              : undefined
        } catch {
          method = undefined
        }
        if (method === 'events/subscribe') {
          observed.push({
            mcpName: request.headers.get('mcp-name'),
            method,
          })
        }
      }
    })

    expect(observed.length).toBeGreaterThan(0)
    // Decision record: SDK 2.1.0 MCP_NAME_HEADER_SOURCE has no events/* rows.
    expect(observed.every((row) => row.mcpName === null)).toBe(true)
  })
})
