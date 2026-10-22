import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMCPClient } from '../../src/client'
import type { MCPClient } from '../../src/client'
import type { MCPEvents } from '../../src/events/types'
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
import type { MCPEventOccurrence } from '../../src/events/types'

const definition = {
  name: 'incident.created',
  delivery: ['webhook'] as Array<'webhook'>,
  inputSchema: {},
  payloadSchema: true,
}

describe('MCP Events HTTP e2e', () => {
  const store = inMemoryMCPEventStore()
  const received: Array<MCPEventOccurrence> = []
  const gaps: Array<{ cursor: string }> = []
  let nowMs = Date.now()
  let onEventImpl: () => Promise<void> | void = () => undefined
  const webhook = createMCPEventWebhook({
    store,
    now: () => nowMs,
    onEvent: async ({ event }) => {
      await onEventImpl()
      received.push(event)
    },
    onGap: ({ gap }) => {
      gaps.push(gap)
    },
  })

  let mcpUrl = ''
  let hookUrl = ''
  const mcpServer = createServer(async (req, res) => {
    const raw = await readRawBody(req)
    const request = toWebRequest(req, raw)
    const response = await mcpFetch(request)
    await sendWebResponse(res, response)
  })
  const hookServer = createServer(async (req, res) => {
    const raw = await readRawBody(req)
    const request = toWebRequest(req, raw)
    const response = await webhook(request)
    await sendWebResponse(res, response)
  })

  const events = createTestEventsServer({
    events: [definition],
    deliver: (request) => fetch(request),
    allowHttpLoopback: true,
    verify: 'challenge',
    ttlMs: { default: 60_000, min: 1 },
    maxAttempts: 3,
  })
  const mcpFetch = eventsHttpFetch(events)
  let client: MCPClient & { readonly experimental_events: MCPEvents }

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      mcpServer.listen(0, '127.0.0.1', () => resolve())
    })
    await new Promise<void>((resolve) => {
      hookServer.listen(0, '127.0.0.1', () => resolve())
    })
    const mcpPort = (mcpServer.address() as AddressInfo).port
    const hookPort = (hookServer.address() as AddressInfo).port
    mcpUrl = `http://127.0.0.1:${mcpPort}/mcp`
    hookUrl = `http://127.0.0.1:${hookPort}/hook`
    client = await createMCPClient({
      transport: { type: 'http', url: mcpUrl },
      experimental_events: { store },
    })
  })

  afterAll(async () => {
    await client?.close()
    await new Promise<void>((resolve, reject) => {
      mcpServer.close((err) => (err ? reject(err) : resolve()))
    })
    await new Promise<void>((resolve, reject) => {
      hookServer.close((err) => (err ? reject(err) : resolve()))
    })
  })

  it('lists events over HTTP', async () => {
    const listed = await client.experimental_events.list()
    expect(listed.map((item) => item.name)).toEqual(['incident.created'])
  })

  it('subscribes with allowInsecureLocalhost and passes the HTTP challenge round trip', async () => {
    const sub = await client.experimental_events.subscribe({
      name: 'incident.created',
      delivery: {
        mode: 'webhook',
        url: hookUrl,
        allowInsecureLocalhost: true,
      },
    })
    expect(sub.id).toBeTypeOf('string')
    expect((await store.get(sub.key))?.status).toBe('active')
  })

  it('delivers a signed event over the network to onEvent and stores the cursor', async () => {
    const listed = [...(await collect(store))]
    const sub = listed[0]!
    await events.emit('incident.created', { id: 'inc_1' }, { cursor: 'c-net' })
    expect(received.at(-1)?.data).toEqual({ id: 'inc_1' })
    expect((await store.get(sub.key))?.cursor).toBe('c-net')
  })

  it('retries a 503 from a throwing onEvent and delivers on the next attempt', async () => {
    received.length = 0
    let throws = true
    onEventImpl = () => {
      if (throws) {
        throws = false
        throw new Error('boom')
      }
    }
    const result = await events.emit('incident.created', { id: 'retry' })
    expect(result[0]?.attempts).toBe(2)
    expect(received.at(-1)?.data).toEqual({ id: 'retry' })
    onEventImpl = () => undefined
  })

  it('a gap sets truncated and the next refresh sends the gap cursor', async () => {
    const sub = (await collect(store))[0]!
    await events.gap(sub.id!, 'gap-cursor')
    expect(gaps.at(-1)?.cursor).toBe('gap-cursor')
    expect((await store.get(sub.key))?.truncated).toBe(true)
    expect((await store.get(sub.key))?.cursor).toBe('gap-cursor')
    const refreshed = await client.experimental_events.refresh({ key: sub.key })
    expect(refreshed.cursor).toBe('gap-cursor')
  })

  it('refresh before refreshBefore extends the lease (refreshBefore moves forward)', async () => {
    const before = (await collect(store))[0]!
    await new Promise((resolve) => setTimeout(resolve, 20))
    const refreshed = await client.experimental_events.refresh({
      key: before.key,
    })
    expect(Date.parse(refreshed.refreshBefore ?? '')).toBeGreaterThan(
      Date.parse(before.refreshBefore ?? ''),
    )
  })

  it('an event after the lease expired gets 410 and is not retried', async () => {
    nowMs = Date.now()
    const short = await client.experimental_events.subscribe({
      name: 'incident.created',
      arguments: { lease: 'short' },
      delivery: {
        mode: 'webhook',
        url: hookUrl,
        allowInsecureLocalhost: true,
      },
      ttlMs: 1,
    })
    nowMs = Date.now() + 5_000
    received.length = 0
    const result = await events.emit(
      'incident.created',
      { id: 'expired' },
      { arguments: { lease: 'short' } },
    )
    expect(result[0]).toEqual({ status: 410, attempts: 1 })
    expect(received).toHaveLength(0)
    nowMs = Date.now()
    await client.experimental_events.unsubscribe({ key: short.key })
  })

  it('terminate removes the local subscription', async () => {
    const sub = await client.experimental_events.subscribe({
      name: 'incident.created',
      arguments: { kind: 'term' },
      delivery: {
        mode: 'webhook',
        url: hookUrl,
        allowInsecureLocalhost: true,
      },
    })
    await events.terminate(sub.id, { code: -32023, message: 'gone' })
    expect(await store.get(sub.key)).toBeUndefined()
  })

  it('unsubscribe removes the subscription on both sides; a later emit delivers nothing', async () => {
    const sub = await client.experimental_events.subscribe({
      name: 'incident.created',
      arguments: { kind: 'unsub' },
      delivery: {
        mode: 'webhook',
        url: hookUrl,
        allowInsecureLocalhost: true,
      },
    })
    received.length = 0
    await client.experimental_events.unsubscribe({ key: sub.key })
    expect(await store.get(sub.key)).toBeUndefined()
    expect(events.subscriptions().some((item) => item.id === sub.id)).toBe(
      false,
    )
    await events.emit(
      'incident.created',
      { id: 'after-unsub' },
      { arguments: { kind: 'unsub' } },
    )
    expect(received).toHaveLength(0)
  })

  it('the receiver rejects a request replayed after the tolerance window', async () => {
    const sub = await client.experimental_events.subscribe({
      name: 'incident.created',
      arguments: { kind: 'replay' },
      delivery: {
        mode: 'webhook',
        url: hookUrl,
        allowInsecureLocalhost: true,
      },
    })
    let captured: Request | undefined
    const originalDeliver = events
    void originalDeliver
    const listed = events.subscriptions().find((item) => item.id === sub.id)!
    const body = {
      eventId: 'evt_replay',
      name: 'incident.created',
      timestamp: new Date().toISOString(),
      data: { id: 'replay' },
    }
    const { signMCPEventPayload } = await import('../../src/events/signature')
    const raw = new TextEncoder().encode(JSON.stringify(body))
    const timestamp = Math.floor(nowMs / 1000)
    const signature = await signMCPEventPayload({
      secret: listed.secret,
      messageId: 'evt_replay',
      timestamp,
      body: raw,
    })
    captured = new Request(listed.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'webhook-id': 'evt_replay',
        'webhook-timestamp': String(timestamp),
        'webhook-signature': signature,
        'x-mcp-subscription-id': listed.id,
      },
      body: raw,
    })
    nowMs += 301_000
    const replayed = await webhook(captured)
    expect(replayed.status).toBe(401)
    nowMs = Date.now()
    await client.experimental_events.unsubscribe({ key: sub.key })
  })
})

async function collect(store: ReturnType<typeof inMemoryMCPEventStore>) {
  const items = []
  for await (const item of store.list!()) items.push(item)
  return items
}
