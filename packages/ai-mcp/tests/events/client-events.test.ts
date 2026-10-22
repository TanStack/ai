import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { InMemoryTransport } from '@modelcontextprotocol/client'
import { createMCPClient } from '../../src/client'
import {
  MCPEventConfigError,
  MCPEventRequestError,
  MCPEventsUnsupportedError,
} from '../../src/errors'
import { MCP_EVENTS_EXTENSION } from '../../src/events/capability'
import { createMCPEventWebhook } from '../../src/events/webhook'
import { inMemoryMCPEventStore } from '../../src/events/memory-store'
import {
  createTestEventsServer,
  eventsHttpFetch,
} from '../helpers/events-server'
import {
  readRawBody,
  sendWebResponse,
  toWebRequest,
} from '../helpers/node-request'
import type {
  MCPEventOccurrence,
  MCPEventSubscriptionInfo,
} from '../../src/events/types'

const definition = {
  name: 'incident.created',
  delivery: ['webhook'] as Array<'webhook'>,
  inputSchema: {},
  payloadSchema: true,
}

async function connectedClient(input: {
  store?: ReturnType<typeof inMemoryMCPEventStore>
  errorOn?: Parameters<typeof createTestEventsServer>[0] extends infer T
    ? T extends { errorOn?: infer E }
      ? E
      : never
    : never
  captureCapabilities?: boolean
}) {
  const store = input.store ?? inMemoryMCPEventStore()
  const received: Array<{
    event: MCPEventOccurrence
    subscription: MCPEventSubscriptionInfo
    messageId: string
  }> = []
  const terminated: Array<unknown> = []
  const webhook = createMCPEventWebhook({
    store,
    onEvent: (args) => {
      received.push(args)
    },
    onTerminated: (args) => {
      terminated.push(args)
    },
  })
  const events = createTestEventsServer({
    events: [definition],
    deliver: (request) => webhook(request),
    allowHttpLoopback: true,
    verify: 'challenge',
    errorOn: input.errorOn,
  })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await events.server.connect(serverTransport)
  const client = await createMCPClient({
    transport: clientTransport,
    experimental_events: { store },
  })
  return { client, events, store, received, terminated, webhook }
}

describe('createMCPClient experimental_events', () => {
  it('subscribe completes the server challenge through the receiver while pending', async () => {
    const { client, store } = await connectedClient({})
    const sub = await client.experimental_events.subscribe({
      name: 'incident.created',
      delivery: {
        mode: 'webhook',
        url: 'http://127.0.0.1/hook',
        allowInsecureLocalhost: true,
      },
    })
    expect(sub.id).toBeTypeOf('string')
    expect((await store.get(sub.key))?.status).toBe('active')
    await client.close()
  })

  it('an emitted event reaches onEvent and advances the stored cursor', async () => {
    const { client, events, store, received } = await connectedClient({})
    const sub = await client.experimental_events.subscribe({
      name: 'incident.created',
      delivery: {
        mode: 'webhook',
        url: 'http://127.0.0.1/hook',
        allowInsecureLocalhost: true,
      },
    })
    await events.emit('incident.created', { id: 'inc_1' }, { cursor: 'c9' })
    expect(received).toHaveLength(1)
    expect(received[0]?.event.data).toEqual({ id: 'inc_1' })
    expect((await store.get(sub.key))?.cursor).toBe('c9')
    await client.close()
  })

  it('a new client over the same store can refresh by key and keeps key, url and secret', async () => {
    const store = inMemoryMCPEventStore()
    const first = await connectedClient({ store })
    const sub = await first.client.experimental_events.subscribe({
      name: 'incident.created',
      delivery: {
        mode: 'webhook',
        url: 'http://127.0.0.1/hook',
        allowInsecureLocalhost: true,
      },
    })
    const before = await store.get(sub.key)
    await first.client.close()

    const second = await connectedClient({ store })
    const refreshed = await second.client.experimental_events.refresh({
      key: sub.key,
    })
    expect(refreshed.key).toBe(sub.key)
    const after = await store.get(sub.key)
    expect(after?.delivery.url).toBe(before?.delivery.url)
    expect(after?.delivery.secret).toBe(before?.delivery.secret)
    await second.client.close()
  })

  it('a revoked renewal (errorOn subscribe -32024) leaves the record and surfaces kind forbidden', async () => {
    const store = inMemoryMCPEventStore()
    const first = await connectedClient({ store })
    const sub = await first.client.experimental_events.subscribe({
      name: 'incident.created',
      delivery: {
        mode: 'webhook',
        url: 'http://127.0.0.1/hook',
        allowInsecureLocalhost: true,
      },
    })
    await first.client.close()

    const second = await connectedClient({
      store,
      errorOn: {
        'events/subscribe': { code: -32024, message: 'revoked' },
      },
    })
    await expect(
      second.client.experimental_events.refresh({ key: sub.key }),
    ).rejects.toMatchObject({ kind: 'forbidden' })
    expect(await store.get(sub.key)).toBeDefined()
    expect(MCPEventRequestError).toBeTypeOf('function')
    await second.client.close()
  })

  it('terminate() deletes the local record and calls onTerminated', async () => {
    const { client, events, store, terminated } = await connectedClient({})
    const sub = await client.experimental_events.subscribe({
      name: 'incident.created',
      delivery: {
        mode: 'webhook',
        url: 'http://127.0.0.1/hook',
        allowInsecureLocalhost: true,
      },
    })
    await events.terminate(sub.id, { code: -32024, message: 'revoked' })
    expect(terminated).toHaveLength(1)
    expect(await store.get(sub.key)).toBeUndefined()
    await client.close()
  })

  it('client declares the events client capability only when experimental_events is set', async () => {
    const withEvents = createTestEventsServer({ verify: 'skip' })
    const [ct, st] = InMemoryTransport.createLinkedPair()
    await withEvents.server.connect(st)
    const client = await createMCPClient({
      transport: ct,
      experimental_events: { store: inMemoryMCPEventStore() },
    })
    await client.experimental_events.list()
    expect(withEvents.capturedClientCapabilities.at(-1)).toMatchObject({
      extensions: { [MCP_EVENTS_EXTENSION]: {} },
    })
    await client.close()

    const without = createTestEventsServer({ verify: 'skip' })
    const [ct2, st2] = InMemoryTransport.createLinkedPair()
    await without.server.connect(st2)
    const discovery = await createMCPClient({ transport: ct2 })
    await discovery.experimental_events.list()
    const caps = without.capturedClientCapabilities.at(-1) as
      | { extensions?: Record<string, unknown> }
      | undefined
    expect(caps?.extensions?.[MCP_EVENTS_EXTENSION]).toBeUndefined()
    await discovery.close()
  })

  it('close() does not send events/unsubscribe', async () => {
    const { client, events } = await connectedClient({})
    await client.experimental_events.subscribe({
      name: 'incident.created',
      delivery: {
        mode: 'webhook',
        url: 'http://127.0.0.1/hook',
        allowInsecureLocalhost: true,
      },
    })
    await client.close()
    expect(
      events.requests.some((row) => row.method === 'events/unsubscribe'),
    ).toBe(false)
  })

  it('throws MCPEventConfigError when both store and adapter are given', async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair()
    const events = createTestEventsServer({ verify: 'skip' })
    await events.server.connect(serverTransport)
    await expect(
      createMCPClient({
        transport: clientTransport,
        experimental_events: {
          store: inMemoryMCPEventStore(),
          // @ts-expect-error store and adapter together
          adapter: {
            createAdapter: () => ({
              subscribe: async () => {
                throw new Error('unused')
              },
              getSubscription: async () => undefined,
              listSubscriptions: async () => [],
              unsubscribe: async () => {},
            }),
          },
        },
      }),
    ).rejects.toBeInstanceOf(MCPEventConfigError)
  })
})

async function listenHttp(
  fetchImpl: (request: Request) => Promise<Response>,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(async (req, res) => {
    const raw = await readRawBody(req)
    const request = toWebRequest(req, raw)
    await sendWebResponse(res, await fetchImpl(request))
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const port = (server.address() as AddressInfo).port
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      }),
  }
}

describe('createMCPClient HTTP capability detection', () => {
  it('throws MCPEventsUnsupportedError when the server does not declare the extension', async () => {
    const events = createTestEventsServer({
      verify: 'skip',
      advertise: false,
    })
    const http = await listenHttp(eventsHttpFetch(events))
    const client = await createMCPClient({
      transport: { type: 'http', url: http.url },
    })
    try {
      await expect(client.experimental_events.list()).rejects.toBeInstanceOf(
        MCPEventsUnsupportedError,
      )
    } finally {
      await client.close()
      await http.close()
    }
  })

  it('lists when the server declares the SEP extension', async () => {
    const events = createTestEventsServer({
      verify: 'skip',
    })
    const http = await listenHttp(eventsHttpFetch(events))
    const client = await createMCPClient({
      transport: { type: 'http', url: http.url },
    })
    try {
      const listed = await client.experimental_events.list()
      expect(listed.map((item) => item.name)).toEqual(['incident.created'])
    } finally {
      await client.close()
      await http.close()
    }
  })
})
