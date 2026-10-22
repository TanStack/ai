import { describe, expect, it, vi } from 'vitest'
import { createMCPEventSecret } from '../../src/events/secret'
import { inMemoryMCPEventStore } from '../../src/events/memory-store'
import { createMCPEventWebhook } from '../../src/events/webhook'
import { MCPEventWebhookError } from '../../src/events/types'
import type {
  MCPEventStore,
  MCPEventSubscription,
  MCPEventWebhookOptions,
} from '../../src/events/types'
import { signedRequest } from '../helpers/sign-webhook'

const FIXED_NOW = Date.parse('2026-10-17T00:00:00Z')
const FIXED_TS = Math.floor(FIXED_NOW / 1000)

function sampleRecord(
  patch: Partial<MCPEventSubscription> = {},
): MCPEventSubscription {
  const key = patch.key ?? 'key-1'
  return {
    key,
    id: 'sub-1',
    name: 'incident.created',
    arguments: { repo: 'acme/app' },
    definition: {
      name: 'incident.created',
      delivery: ['webhook'],
      inputSchema: {},
      payloadSchema: true,
    },
    delivery: {
      mode: 'webhook',
      url: `https://hooks.example.test/mcp?mcp_event_subscription=${key}`,
      secret: createMCPEventSecret(),
    },
    cursor: 'c0',
    truncated: false,
    status: 'active',
    ...patch,
  }
}

function eventBody(patch: Record<string, unknown> = {}): {
  eventId: string
  name: string
  timestamp: string
  data: { id: string }
  cursor?: string | null
} {
  return {
    eventId: 'evt_1',
    name: 'incident.created',
    timestamp: '2026-10-17T00:00:00Z',
    data: { id: '1' },
    cursor: 'c1',
    ...patch,
  }
}

async function setup(
  record: MCPEventSubscription,
  extra: Partial<MCPEventWebhookOptions> = {},
) {
  const store = inMemoryMCPEventStore()
  await store.set(record)
  const errors: Array<MCPEventWebhookError> = []
  const onEvent = vi.fn()
  const onGap = vi.fn()
  const onTerminated = vi.fn()
  const webhook = createMCPEventWebhook({
    store,
    onEvent,
    onGap,
    onTerminated,
    onError: (error) => errors.push(error),
    now: () => FIXED_NOW,
    ...extra,
  })
  return { store, webhook, onEvent, onGap, onTerminated, errors }
}

describe('createMCPEventWebhook', () => {
  it('rejects GET with 405 and Allow: POST', async () => {
    const { webhook, errors } = await setup(sampleRecord())
    const response = await webhook(
      new Request('https://hooks.example.test/mcp', { method: 'GET' }),
    )
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('POST')
    expect(errors).toEqual([])
  })

  it('rejects text/plain with 415', async () => {
    const record = sampleRecord()
    const { webhook } = await setup(record)
    const request = await signedRequest({
      record,
      body: eventBody(),
      timestamp: FIXED_TS,
      headers: { 'content-type': 'text/plain' },
    })
    expect((await webhook(request)).status).toBe(415)
  })

  it('accepts application/json; charset=utf-8', async () => {
    const record = sampleRecord()
    const { webhook } = await setup(record)
    const request = await signedRequest({
      record,
      body: eventBody(),
      timestamp: FIXED_TS,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
    expect((await webhook(request)).status).toBe(204)
  })

  it('rejects Content-Length 262145 with 413', async () => {
    const record = sampleRecord()
    const { webhook } = await setup(record)
    const request = await signedRequest({
      record,
      body: eventBody(),
      timestamp: FIXED_TS,
      headers: { 'content-length': '262145' },
    })
    expect((await webhook(request)).status).toBe(413)
  })

  it.each([
    'webhook-id',
    'webhook-timestamp',
    'webhook-signature',
    'x-mcp-subscription-id',
  ])('returns 401 without %s', async (headerName) => {
    const record = sampleRecord()
    const { webhook } = await setup(record)
    const request = await signedRequest({
      record,
      body: eventBody(),
      timestamp: FIXED_TS,
      headers: { [headerName]: undefined },
    })
    expect((await webhook(request)).status).toBe(401)
  })

  it('returns 401 without the mcp_event_subscription query param', async () => {
    const record = sampleRecord()
    const { webhook } = await setup(record)
    const request = await signedRequest({
      record,
      body: eventBody(),
      timestamp: FIXED_TS,
      url: 'https://hooks.example.test/mcp',
    })
    expect((await webhook(request)).status).toBe(401)
  })

  it('returns 401 for an unknown key', async () => {
    const record = sampleRecord()
    const { webhook } = await setup(record)
    const request = await signedRequest({
      record,
      body: eventBody(),
      timestamp: FIXED_TS,
      url: 'https://hooks.example.test/mcp?mcp_event_subscription=missing',
    })
    expect((await webhook(request)).status).toBe(401)
  })

  it('returns 401 when a stored id differs from X-MCP-Subscription-Id', async () => {
    const record = sampleRecord()
    const { webhook } = await setup(record)
    const request = await signedRequest({
      record,
      body: eventBody(),
      timestamp: FIXED_TS,
      headers: { 'x-mcp-subscription-id': 'other' },
    })
    expect((await webhook(request)).status).toBe(401)
  })

  it('accepts any X-MCP-Subscription-Id while the record has no id', async () => {
    const record = sampleRecord({ id: undefined, status: 'pending' })
    const { webhook } = await setup(record)
    const request = await signedRequest({
      record,
      body: { type: 'verification', challenge: 'n' },
      timestamp: FIXED_TS,
      headers: { 'x-mcp-subscription-id': 'anything' },
    })
    expect((await webhook(request)).status).toBe(200)
  })

  it('accepts timestamps at ±300s and returns 401 at ±301s', async () => {
    const record = sampleRecord()
    const { webhook } = await setup(record)
    const plus300 = await signedRequest({
      record,
      body: eventBody(),
      timestamp: FIXED_TS + 300,
    })
    const minus300 = await signedRequest({
      record,
      body: eventBody({ eventId: 'evt_minus' }),
      timestamp: FIXED_TS - 300,
      messageId: 'evt_minus',
    })
    const plus301 = await signedRequest({
      record,
      body: eventBody({ eventId: 'evt_late' }),
      timestamp: FIXED_TS + 301,
      messageId: 'evt_late',
    })
    expect((await webhook(plus300)).status).toBe(204)
    expect((await webhook(minus300)).status).toBe(204)
    expect((await webhook(plus301)).status).toBe(401)
  })

  it('returns 401 for a millisecond timestamp', async () => {
    const record = sampleRecord()
    const { webhook } = await setup(record)
    const request = await signedRequest({
      record,
      body: eventBody(),
      timestamp: FIXED_NOW,
    })
    expect((await webhook(request)).status).toBe(401)
  })

  it('returns 413 when a chunked body without Content-Length exceeds 262144 bytes', async () => {
    const record = sampleRecord()
    const { webhook } = await setup(record)
    const oversized = new Uint8Array(262145)
    oversized.fill(97)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(oversized)
        controller.close()
      },
    })
    const signed = await signedRequest({
      record,
      body: eventBody(),
      timestamp: FIXED_TS,
      rawBody: oversized,
    })
    const headers = new Headers(signed.headers)
    headers.delete('content-length')
    const request = new Request(signed.url, {
      method: 'POST',
      headers,
      body: stream,
      // @ts-expect-error duplex is required for streamed fetch bodies in Node
      duplex: 'half',
    })
    expect((await webhook(request)).status).toBe(413)
  })

  it('returns 401 for a bad signature', async () => {
    const record = sampleRecord()
    const { webhook } = await setup(record)
    const request = await signedRequest({
      record,
      body: eventBody(),
      timestamp: FIXED_TS,
      headers: { 'webhook-signature': 'v1,aaaa' },
    })
    expect((await webhook(request)).status).toBe(401)
  })

  it('returns 401 when the body was re-serialized by middleware', async () => {
    const record = sampleRecord()
    const { webhook, errors } = await setup(record)
    const original =
      '{"eventId":"evt_1","name":"incident.created","timestamp":"2026-10-17T00:00:00Z","data":{},"cursor":"c1"}'
    const signed = await signedRequest({
      record,
      body: JSON.parse(original),
      timestamp: FIXED_TS,
      rawBody: new TextEncoder().encode(original),
      messageId: 'evt_1',
    })
    const resent = JSON.stringify(JSON.parse(original), null, 2)
    const request = new Request(signed, {
      body: resent,
    })
    const response = await webhook(request)
    expect(response.status).toBe(401)
    expect(errors.at(-1)?.stage).toBe('signature')
  })

  it('returns 400 for non-JSON', async () => {
    const record = sampleRecord()
    const { webhook } = await setup(record)
    const request = await signedRequest({
      record,
      body: eventBody(),
      timestamp: FIXED_TS,
      rawBody: new TextEncoder().encode('not-json'),
    })
    expect((await webhook(request)).status).toBe(400)
  })

  it('answers a signed verification with 200 {challenge} while pending, without calling onEvent', async () => {
    const record = sampleRecord({ id: undefined, status: 'pending' })
    const { webhook, onEvent } = await setup(record)
    const request = await signedRequest({
      record,
      body: { type: 'verification', challenge: 'nonce-1' },
      timestamp: FIXED_TS,
    })
    const response = await webhook(request)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ challenge: 'nonce-1' })
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('returns 401 for an unsigned verification', async () => {
    const record = sampleRecord({ id: undefined, status: 'pending' })
    const { webhook } = await setup(record)
    const request = await signedRequest({
      record,
      body: { type: 'verification', challenge: 'nonce-1' },
      timestamp: FIXED_TS,
      headers: { 'webhook-signature': 'v1,aaaa' },
    })
    expect((await webhook(request)).status).toBe(401)
  })

  it('returns 400 for an invalid control', async () => {
    const record = sampleRecord()
    const { webhook } = await setup(record)
    const request = await signedRequest({
      record,
      body: { type: 'gap' },
      timestamp: FIXED_TS,
    })
    expect((await webhook(request)).status).toBe(400)
  })

  it('on terminated, calls onTerminated then deletes the record and returns 204, even when pending or expired', async () => {
    const pending = sampleRecord({
      key: 'pending-key',
      id: undefined,
      status: 'pending',
    })
    const expired = sampleRecord({
      key: 'expired-key',
      refreshBefore: '2020-01-01T00:00:00Z',
    })
    for (const record of [pending, expired]) {
      const { webhook, onTerminated, store } = await setup(record)
      const request = await signedRequest({
        record,
        body: {
          type: 'terminated',
          error: { code: -32024, message: 'revoked' },
        },
        timestamp: FIXED_TS,
      })
      expect((await webhook(request)).status).toBe(204)
      expect(onTerminated).toHaveBeenCalledOnce()
      expect(await store.get(record.key)).toBeUndefined()
    }
  })

  it('returns 503 and keeps the record when onTerminated throws', async () => {
    const record = sampleRecord()
    const { webhook, store } = await setup(record, {
      onTerminated: () => {
        throw new Error('boom')
      },
    })
    const request = await signedRequest({
      record,
      body: { type: 'terminated', error: { code: -32024, message: 'x' } },
      timestamp: FIXED_TS,
    })
    expect((await webhook(request)).status).toBe(503)
    expect(await store.get(record.key)).toBeDefined()
  })

  it('returns 503 for an event while the record is pending', async () => {
    const record = sampleRecord({ id: undefined, status: 'pending' })
    const { webhook, errors } = await setup(record)
    const request = await signedRequest({
      record,
      body: eventBody(),
      timestamp: FIXED_TS,
    })
    expect((await webhook(request)).status).toBe(503)
    expect(errors.at(-1)?.stage).toBe('routing')
  })

  it('returns 503 for a gap while pending', async () => {
    const record = sampleRecord({ id: undefined, status: 'pending' })
    const { webhook } = await setup(record)
    const request = await signedRequest({
      record,
      body: { type: 'gap', cursor: 'c9' },
      timestamp: FIXED_TS,
    })
    expect((await webhook(request)).status).toBe(503)
  })

  it('on gap, calls onGap, stores cursor and truncated:true, returns 204', async () => {
    const record = sampleRecord()
    const { webhook, onGap, store } = await setup(record)
    const request = await signedRequest({
      record,
      body: { type: 'gap', cursor: 'c9' },
      timestamp: FIXED_TS,
    })
    expect((await webhook(request)).status).toBe(204)
    expect(onGap).toHaveBeenCalledOnce()
    const stored = await store.get(record.key)
    expect(stored?.cursor).toBe('c9')
    expect(stored?.truncated).toBe(true)
  })

  it('processes a gap after refreshBefore', async () => {
    const record = sampleRecord({ refreshBefore: '2020-01-01T00:00:00Z' })
    const { webhook, store } = await setup(record)
    const request = await signedRequest({
      record,
      body: { type: 'gap', cursor: 'c-gap' },
      timestamp: FIXED_TS,
    })
    expect((await webhook(request)).status).toBe(204)
    expect((await store.get(record.key))?.truncated).toBe(true)
  })

  it('returns 503 and keeps the old cursor when store.update throws', async () => {
    const record = sampleRecord()
    const store = inMemoryMCPEventStore()
    await store.set(record)
    const wrapped: MCPEventStore = {
      get: (key) => store.get(key),
      getById: (id) => store.getById(id),
      set: (sub) => store.set(sub),
      delete: (key) => store.delete(key),
      update: async () => {
        throw new Error('disk full')
      },
    }
    const webhook = createMCPEventWebhook({
      store: wrapped,
      onEvent: () => {},
      now: () => FIXED_NOW,
    })
    const request = await signedRequest({
      record,
      body: { type: 'gap', cursor: 'c-new' },
      timestamp: FIXED_TS,
    })
    expect((await webhook(request)).status).toBe(503)
    expect((await store.get(record.key))?.cursor).toBe('c0')
  })

  it('returns 410 for an event after refreshBefore', async () => {
    const record = sampleRecord({ refreshBefore: '2020-01-01T00:00:00Z' })
    const { webhook, onEvent, errors } = await setup(record)
    const request = await signedRequest({
      record,
      body: eventBody(),
      timestamp: FIXED_TS,
    })
    expect((await webhook(request)).status).toBe(410)
    expect(onEvent).not.toHaveBeenCalled()
    expect(errors.at(-1)?.stage).toBe('routing')
  })

  it('returns 503 with stage store when the stored secret is invalid', async () => {
    const record = sampleRecord()
    const { webhook, errors } = await setup({
      ...record,
      delivery: { ...record.delivery, secret: 'not-a-secret' },
    })
    const request = await signedRequest({
      record,
      body: eventBody(),
      timestamp: FIXED_TS,
    })
    expect((await webhook(request)).status).toBe(503)
    expect(errors.at(-1)?.stage).toBe('store')
  })

  it('returns 400 when event.name differs from the subscription', async () => {
    const record = sampleRecord()
    const { webhook } = await setup(record)
    const request = await signedRequest({
      record,
      body: eventBody({ name: 'other.event' }),
      timestamp: FIXED_TS,
    })
    expect((await webhook(request)).status).toBe(400)
  })

  it('returns 400 when eventId differs from webhook-id', async () => {
    const record = sampleRecord()
    const { webhook } = await setup(record)
    const request = await signedRequest({
      record,
      body: eventBody({ eventId: 'evt_other' }),
      timestamp: FIXED_TS,
      messageId: 'evt_1',
    })
    expect((await webhook(request)).status).toBe(400)
  })

  it('returns 400 and calls onError(stage payload) when validatePayload throws', async () => {
    const record = sampleRecord()
    const { webhook, errors } = await setup(record, {
      validatePayload: () => {
        throw new Error('bad payload')
      },
    })
    const request = await signedRequest({
      record,
      body: eventBody(),
      timestamp: FIXED_TS,
    })
    expect((await webhook(request)).status).toBe(400)
    expect(errors.at(-1)?.stage).toBe('payload')
  })

  it('calls onEvent with info (no secret) and messageId, then stores event.cursor, returns 204', async () => {
    const record = sampleRecord()
    const { webhook, onEvent, store } = await setup(record)
    const request = await signedRequest({
      record,
      body: eventBody(),
      timestamp: FIXED_TS,
    })
    expect((await webhook(request)).status).toBe(204)
    expect(onEvent).toHaveBeenCalledOnce()
    const arg = onEvent.mock.calls[0]![0]
    expect(arg.messageId).toBe('evt_1')
    expect('secret' in arg.subscription.delivery).toBe(false)
    expect((await store.get(record.key))?.cursor).toBe('c1')
  })

  it('does not touch the cursor when the event has no cursor', async () => {
    const record = sampleRecord()
    const { webhook, store } = await setup(record)
    const body = eventBody()
    delete body.cursor
    const request = await signedRequest({
      record,
      body,
      timestamp: FIXED_TS,
    })
    expect((await webhook(request)).status).toBe(204)
    expect((await store.get(record.key))?.cursor).toBe('c0')
  })

  it('stores cursor null when event.cursor is null', async () => {
    const record = sampleRecord()
    const { webhook, store } = await setup(record)
    const request = await signedRequest({
      record,
      body: eventBody({ cursor: null }),
      timestamp: FIXED_TS,
    })
    expect((await webhook(request)).status).toBe(204)
    expect((await store.get(record.key))?.cursor).toBeNull()
  })

  it('returns 503 and keeps the cursor when onEvent throws', async () => {
    const record = sampleRecord()
    const { webhook, store } = await setup(record, {
      onEvent: () => {
        throw new Error('handler down')
      },
    })
    const request = await signedRequest({
      record,
      body: eventBody(),
      timestamp: FIXED_TS,
    })
    expect((await webhook(request)).status).toBe(503)
    expect((await store.get(record.key))?.cursor).toBe('c0')
  })

  it('returns 503 after onEvent succeeds but store.update throws, and the redelivery calls onEvent again with the same messageId', async () => {
    const record = sampleRecord()
    const inner = inMemoryMCPEventStore()
    await inner.set(record)
    let failUpdate = true
    const store: MCPEventStore = {
      get: (key) => inner.get(key),
      getById: (id) => inner.getById(id),
      set: (sub) => inner.set(sub),
      delete: (key) => inner.delete(key),
      update: async (key, patch) => {
        if (failUpdate) throw new Error('write failed')
        return inner.update(key, patch)
      },
    }
    const onEvent = vi.fn()
    const webhook = createMCPEventWebhook({
      store,
      onEvent,
      now: () => FIXED_NOW,
    })
    const request = await signedRequest({
      record,
      body: eventBody(),
      timestamp: FIXED_TS,
    })
    expect((await webhook(request.clone())).status).toBe(503)
    failUpdate = false
    expect((await webhook(request.clone())).status).toBe(204)
    expect(onEvent.mock.calls.map((call) => call[0].messageId)).toEqual([
      'evt_1',
      'evt_1',
    ])
  })

  it('never includes the secret in onError payloads or in response bodies', async () => {
    const secret = createMCPEventSecret()
    const record = sampleRecord({
      delivery: {
        mode: 'webhook',
        url: 'https://hooks.example.test/mcp?mcp_event_subscription=key-1',
        secret,
      },
    })
    const errors: Array<unknown> = []
    const bodies: Array<string> = []
    const store = inMemoryMCPEventStore()
    await store.set(record)
    const webhook = createMCPEventWebhook({
      store,
      onEvent: () => {},
      onError: (error) => errors.push(error),
      now: () => FIXED_NOW,
    })
    const cases = [
      await signedRequest({
        record,
        body: eventBody(),
        timestamp: FIXED_TS,
        headers: { 'webhook-signature': 'v1,aaaa' },
      }),
      await signedRequest({
        record,
        body: eventBody(),
        timestamp: FIXED_TS,
        url: 'https://hooks.example.test/mcp',
      }),
      await signedRequest({
        record,
        body: 'not-json',
        timestamp: FIXED_TS,
        rawBody: new TextEncoder().encode('not-json'),
      }),
    ]
    for (const request of cases) {
      const response = await webhook(request)
      bodies.push(await response.text())
    }
    const serialized = JSON.stringify(errors) + bodies.join('')
    expect(serialized).not.toContain(secret)
  })
})
