import { describe, expect, it } from 'vitest'
import { ProtocolError } from '@modelcontextprotocol/client'
import { MCPConnectionError } from '../../src/errors'
import {
  MCPEventConfigError,
  MCPEventRequestError,
  MCPEventSubscriptionNotFoundError,
  MCPEventsUnsupportedError,
  MCPUnknownEventError,
} from '../../src/errors'
import { createDirectMCPEvents } from '../../src/events/direct'
import { createDiscoveryMCPEvents } from '../../src/events/discovery'
import { inMemoryMCPEventStore } from '../../src/events/memory-store'
import { createMCPEventSecret } from '../../src/events/secret'
import type {
  MCPEventDefinition,
  MCPEventStore,
  MCPEventsContext,
  MCPStandardSchema,
} from '../../src/events/types'

const webhookDef: MCPEventDefinition = {
  name: 'incident.created',
  delivery: ['webhook'],
  inputSchema: {},
  payloadSchema: true,
}

function recordingStore(inner: MCPEventStore = inMemoryMCPEventStore()) {
  const calls: Array<string> = []
  const store: MCPEventStore = {
    async get(key) {
      calls.push('get')
      return inner.get(key)
    },
    async getById(id) {
      calls.push('getById')
      return inner.getById(id)
    },
    async set(subscription) {
      calls.push('set')
      return inner.set(subscription)
    },
    async update(key, patch) {
      calls.push('update')
      return inner.update(key, patch)
    },
    async delete(key) {
      calls.push('delete')
      return inner.delete(key)
    },
    list: inner.list
      ? async function* list() {
          yield* inner.list!()
        }
      : undefined,
  }
  return { store, calls, inner }
}

function fakeCtx(
  overrides: Partial<MCPEventsContext> = {},
): MCPEventsContext & { requests: Array<{ method: string; params: unknown }> } {
  const requests: Array<{ method: string; params: unknown }> = []
  const inner = overrides.request
  const ctx: MCPEventsContext = {
    assertOpen() {},
    supportsEvents: true,
    transport: { type: 'custom' },
    ...overrides,
    async request(
      method,
      params,
      schema: MCPStandardSchema<unknown>,
      signal?: AbortSignal,
    ) {
      requests.push({ method, params })
      if (inner) return inner(method, params, schema, signal)
      throw new Error(`unexpected ${method}`)
    },
  }
  return Object.assign(ctx, { requests })
}

const delivery = {
  mode: 'webhook' as const,
  url: 'https://hooks.example.test/mcp',
  secret: createMCPEventSecret(),
}

describe('createDirectMCPEvents', () => {
  it('subscribe persists a pending record before sending events/subscribe', async () => {
    const { store, calls } = recordingStore()
    const ctx = fakeCtx({
      async request(method) {
        if (method === 'events/list') {
          expect(calls.includes('set')).toBe(false)
          return { events: [webhookDef] }
        }
        expect(calls[0]).toBe('set')
        const listed = store.list
        if (listed === undefined) throw new Error('store.list missing')
        const pending = await store.get(
          (await listed()[Symbol.asyncIterator]().next()).value!.key,
        )
        expect(pending?.status).toBe('pending')
        return {
          id: 'sub_1',
          refreshBefore: null,
          cursor: null,
          truncated: false,
        }
      },
    })
    const api = createDirectMCPEvents(ctx, { store })
    await api.subscribe({ name: 'incident.created', delivery })
    expect(calls[0]).toBe('set')
    expect(ctx.requests.map((row) => row.method)).toContain('events/subscribe')
  })

  it('sends delivery {mode,url-with-key,secret}, cursor null, and omits ttlMs/maxAgeMs when undefined', async () => {
    const store = inMemoryMCPEventStore()
    const ctx = fakeCtx({
      async request(method, params) {
        if (method === 'events/list') return { events: [webhookDef] }
        expect(params).toMatchObject({
          name: 'incident.created',
          arguments: {},
          cursor: null,
          delivery: { mode: 'webhook', secret: delivery.secret },
        })
        expect(params).not.toHaveProperty('ttlMs')
        expect(params).not.toHaveProperty('maxAgeMs')
        expect(params).not.toHaveProperty('allowInsecureLocalhost')
        const url = (params.delivery as { url: string }).url
        expect(url).toContain('mcp_event_subscription=')
        expect(url.startsWith('https://hooks.example.test/mcp?')).toBe(true)
        return {
          id: 'sub_1',
          refreshBefore: null,
          cursor: null,
          truncated: false,
        }
      },
    })
    const api = createDirectMCPEvents(ctx, { store })
    await api.subscribe({ name: 'incident.created', delivery })
  })

  it('sends ttlMs null when requested', async () => {
    const store = inMemoryMCPEventStore()
    const ctx = fakeCtx({
      async request(method, params) {
        if (method === 'events/list') return { events: [webhookDef] }
        expect(params.ttlMs).toBeNull()
        return {
          id: 'sub_1',
          refreshBefore: null,
          cursor: null,
          truncated: false,
        }
      },
    })
    const api = createDirectMCPEvents(ctx, { store })
    await api.subscribe({ name: 'incident.created', delivery, ttlMs: null })
  })

  it('never sends allowInsecureLocalhost', async () => {
    const store = inMemoryMCPEventStore()
    const ctx = fakeCtx({
      async request(method, params) {
        if (method === 'events/list') return { events: [webhookDef] }
        expect(JSON.stringify(params)).not.toContain('allowInsecureLocalhost')
        return {
          id: 'sub_1',
          refreshBefore: null,
          cursor: null,
          truncated: false,
        }
      },
    })
    const api = createDirectMCPEvents(ctx, { store })
    await api.subscribe({
      name: 'incident.created',
      delivery: {
        ...delivery,
        url: 'http://127.0.0.1/hook',
        allowInsecureLocalhost: true,
      },
    })
  })

  it('marks the record active with id/refreshBefore/cursor/truncated on success and returns {key,...}', async () => {
    const store = inMemoryMCPEventStore()
    const ctx = fakeCtx({
      async request(method) {
        if (method === 'events/list') return { events: [webhookDef] }
        return {
          id: 'sub_1',
          refreshBefore: '2026-10-17T01:00:00.000Z',
          cursor: 'c1',
          truncated: true,
        }
      },
    })
    const api = createDirectMCPEvents(ctx, { store })
    const result = await api.subscribe({ name: 'incident.created', delivery })
    expect(result).toMatchObject({
      key: expect.any(String),
      id: 'sub_1',
      refreshBefore: '2026-10-17T01:00:00.000Z',
      cursor: 'c1',
      truncated: true,
    })
    const stored = await store.get(result.key)
    expect(stored?.status).toBe('active')
    expect(stored?.id).toBe('sub_1')
  })

  it('keeps the pending record and throws MCPEventRequestError when the request fails', async () => {
    const store = inMemoryMCPEventStore()
    const ctx = fakeCtx({
      async request(method) {
        if (method === 'events/list') return { events: [webhookDef] }
        throw new ProtocolError(-32027, 'callback failed', {
          reason: 'timeout',
        })
      },
    })
    const api = createDirectMCPEvents(ctx, { store })
    await expect(
      api.subscribe({ name: 'incident.created', delivery }),
    ).rejects.toBeInstanceOf(MCPEventRequestError)
    const listed: Array<{ status: string }> = []
    for await (const item of store.list!()) listed.push(item)
    expect(listed).toHaveLength(1)
    expect(listed[0]?.status).toBe('pending')
  })

  it('refresh({key}) recovers a pending record left by a timed-out subscribe', async () => {
    const store = inMemoryMCPEventStore()
    const ctx = fakeCtx({
      async request(method) {
        if (method === 'events/list') return { events: [webhookDef] }
        throw new ProtocolError(-32027, 'timeout', { reason: 'timeout' })
      },
    })
    const api = createDirectMCPEvents(ctx, { store })
    await expect(
      api.subscribe({ name: 'incident.created', delivery }),
    ).rejects.toBeInstanceOf(MCPEventRequestError)
    let key = ''
    for await (const item of store.list!()) key = item.key
    ctx.request = async (method, params) => {
      expect(method).toBe('events/subscribe')
      expect((params.delivery as { url: string }).url).toContain(key)
      return {
        id: 'sub_recovered',
        refreshBefore: null,
        cursor: null,
        truncated: false,
      }
    }
    const recovered = await api.refresh({ key })
    expect(recovered.id).toBe('sub_recovered')
    expect((await store.get(key))?.status).toBe('active')
  })

  it('throws MCPUnknownEventError not-found / webhook-unsupported', async () => {
    const store = inMemoryMCPEventStore()
    const ctx = fakeCtx({
      async request() {
        return {
          events: [
            webhookDef,
            {
              name: 'poll.only',
              delivery: ['poll'],
              inputSchema: {},
              payloadSchema: true,
            },
          ],
        }
      },
    })
    const api = createDirectMCPEvents(ctx, { store })
    await expect(
      api.subscribe({ name: 'missing', delivery }),
    ).rejects.toMatchObject({
      name: 'MCPUnknownEventError',
      reason: 'not-found',
    })
    await expect(
      api.subscribe({ name: 'poll.only', delivery }),
    ).rejects.toMatchObject({
      name: 'MCPUnknownEventError',
      reason: 'webhook-unsupported',
    })
    expect(MCPUnknownEventError).toBeTypeOf('function')
  })

  it('walks every events/list page to find the event', async () => {
    const store = inMemoryMCPEventStore()
    const ctx = fakeCtx({
      async request(method, params) {
        if (method === 'events/list') {
          if (params.cursor === undefined) {
            return {
              events: [
                {
                  name: 'other',
                  delivery: ['webhook'],
                  inputSchema: {},
                  payloadSchema: true,
                },
              ],
              nextCursor: 'p2',
            }
          }
          return { events: [webhookDef] }
        }
        return {
          id: 'sub_1',
          refreshBefore: null,
          cursor: null,
          truncated: false,
        }
      },
    })
    const api = createDirectMCPEvents(ctx, { store })
    await api.subscribe({ name: 'incident.created', delivery })
    expect(
      ctx.requests.filter((row) => row.method === 'events/list'),
    ).toHaveLength(2)
  })

  it('calls validateArguments with definition and arguments, and aborts before persisting when it throws', async () => {
    const { store, calls } = recordingStore()
    const ctx = fakeCtx({
      async request() {
        return { events: [webhookDef] }
      },
    })
    const api = createDirectMCPEvents(ctx, {
      store,
      validateArguments: ({ definition, arguments: args }) => {
        expect(definition.name).toBe('incident.created')
        expect(args).toEqual({ repo: 'acme' })
        throw new Error('bad args')
      },
    })
    await expect(
      api.subscribe({
        name: 'incident.created',
        arguments: { repo: 'acme' },
        delivery,
      }),
    ).rejects.toThrow('bad args')
    expect(calls).not.toContain('set')
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects ttlMs %s',
    async (ttlMs) => {
      const api = createDirectMCPEvents(fakeCtx(), {
        store: inMemoryMCPEventStore(),
      })
      await expect(
        api.subscribe({
          name: 'incident.created',
          delivery,
          ttlMs,
        }),
      ).rejects.toBeInstanceOf(MCPEventConfigError)
    },
  )

  it('rejects maxAgeMs -1', async () => {
    const api = createDirectMCPEvents(fakeCtx(), {
      store: inMemoryMCPEventStore(),
    })
    await expect(
      api.subscribe({
        name: 'incident.created',
        delivery,
        maxAgeMs: -1,
      }),
    ).rejects.toBeInstanceOf(MCPEventConfigError)
  })

  it('rejects an invalid supplied secret', async () => {
    const api = createDirectMCPEvents(fakeCtx(), {
      store: inMemoryMCPEventStore(),
    })
    await expect(
      api.subscribe({
        name: 'incident.created',
        delivery: { ...delivery, secret: 'not-a-secret' },
      }),
    ).rejects.toBeInstanceOf(MCPEventConfigError)
  })

  it('refresh by id resends the stored name/arguments/url/secret/cursor/ttlMs/maxAgeMs and keeps status active during the request', async () => {
    const store = inMemoryMCPEventStore()
    const ctx = fakeCtx({
      async request(method) {
        if (method === 'events/list') return { events: [webhookDef] }
        return {
          id: 'sub_1',
          refreshBefore: '2026-10-17T01:00:00.000Z',
          cursor: 'c0',
          truncated: false,
        }
      },
    })
    const api = createDirectMCPEvents(ctx, { store })
    const sub = await api.subscribe({
      name: 'incident.created',
      arguments: { repo: 'acme' },
      delivery,
      cursor: 'c0',
      ttlMs: 60_000,
      maxAgeMs: 10,
    })
    let seenStatus = ''
    ctx.request = async (method, params) => {
      expect(method).toBe('events/subscribe')
      expect(params).toMatchObject({
        name: 'incident.created',
        arguments: { repo: 'acme' },
        cursor: 'c0',
        ttlMs: 60_000,
        maxAgeMs: 10,
        delivery: { mode: 'webhook', secret: delivery.secret },
      })
      seenStatus = (await store.get(sub.key))!.status
      return {
        id: 'sub_1',
        refreshBefore: '2026-10-17T02:00:00.000Z',
        cursor: 'c0',
        truncated: false,
      }
    }
    await api.refresh({ id: 'sub_1' })
    expect(seenStatus).toBe('active')
  })

  it('refresh throws MCPEventSubscriptionNotFoundError for an unknown key', async () => {
    const api = createDirectMCPEvents(fakeCtx(), {
      store: inMemoryMCPEventStore(),
    })
    await expect(api.refresh({ key: 'missing' })).rejects.toBeInstanceOf(
      MCPEventSubscriptionNotFoundError,
    )
  })

  it('unsubscribe sends {name,arguments,delivery:{mode,url}} and deletes after success', async () => {
    const store = inMemoryMCPEventStore()
    const ctx = fakeCtx({
      async request(method) {
        if (method === 'events/list') return { events: [webhookDef] }
        if (method === 'events/subscribe') {
          return {
            id: 'sub_1',
            refreshBefore: null,
            cursor: null,
            truncated: false,
          }
        }
        return {}
      },
    })
    const api = createDirectMCPEvents(ctx, { store })
    const sub = await api.subscribe({
      name: 'incident.created',
      arguments: { repo: 'acme' },
      delivery,
    })
    const stored = await store.get(sub.key)
    ctx.requests.length = 0
    await api.unsubscribe({ key: sub.key })
    expect(ctx.requests[0]).toMatchObject({
      method: 'events/unsubscribe',
      params: {
        name: 'incident.created',
        arguments: { repo: 'acme' },
        delivery: { mode: 'webhook', url: stored!.delivery.url },
      },
    })
    expect(await store.get(sub.key)).toBeUndefined()
  })

  it('unsubscribe deletes locally when the server answers -32023', async () => {
    const store = inMemoryMCPEventStore()
    const ctx = fakeCtx({
      async request(method) {
        if (method === 'events/list') return { events: [webhookDef] }
        if (method === 'events/subscribe') {
          return {
            id: 'sub_1',
            refreshBefore: null,
            cursor: null,
            truncated: false,
          }
        }
        throw new ProtocolError(-32023, 'gone')
      },
    })
    const api = createDirectMCPEvents(ctx, { store })
    const sub = await api.subscribe({ name: 'incident.created', delivery })
    await api.unsubscribe({ key: sub.key })
    expect(await store.get(sub.key)).toBeUndefined()
  })

  it('unsubscribe keeps the record when the server answers -32024', async () => {
    const store = inMemoryMCPEventStore()
    const ctx = fakeCtx({
      async request(method) {
        if (method === 'events/list') return { events: [webhookDef] }
        if (method === 'events/subscribe') {
          return {
            id: 'sub_1',
            refreshBefore: null,
            cursor: null,
            truncated: false,
          }
        }
        throw new ProtocolError(-32024, 'forbidden')
      },
    })
    const api = createDirectMCPEvents(ctx, { store })
    const sub = await api.subscribe({ name: 'incident.created', delivery })
    await expect(api.unsubscribe({ key: sub.key })).rejects.toMatchObject({
      kind: 'forbidden',
    })
    expect(await store.get(sub.key)).toBeDefined()
  })

  it('throws MCPEventsUnsupportedError when supportsEvents is false', async () => {
    const api = createDirectMCPEvents(fakeCtx({ supportsEvents: false }), {
      store: inMemoryMCPEventStore(),
    })
    await expect(api.list()).rejects.toBeInstanceOf(MCPEventsUnsupportedError)
  })

  it('maps -32601 from events/list to MCPEventsUnsupportedError', async () => {
    const api = createDirectMCPEvents(
      fakeCtx({
        async request() {
          throw new ProtocolError(-32601, 'Method not found')
        },
      }),
      { store: inMemoryMCPEventStore() },
    )
    await expect(api.list()).rejects.toBeInstanceOf(MCPEventsUnsupportedError)
  })

  it('throws MCPConnectionError after assertOpen fails', async () => {
    const api = createDirectMCPEvents(
      fakeCtx({
        assertOpen() {
          throw new MCPConnectionError('MCP client is closed')
        },
      }),
      { store: inMemoryMCPEventStore() },
    )
    await expect(api.list()).rejects.toBeInstanceOf(MCPConnectionError)
  })
})

describe('createDiscoveryMCPEvents', () => {
  it('list works; subscribe/refresh/unsubscribe throw MCPEventConfigError', async () => {
    const ctx = fakeCtx({
      async request() {
        return { events: [webhookDef] }
      },
    })
    const api = createDiscoveryMCPEvents(ctx)
    expect(await api.list()).toEqual([webhookDef])
    await expect(
      api.subscribe({ name: 'incident.created', delivery }),
    ).rejects.toBeInstanceOf(MCPEventConfigError)
    await expect(api.refresh({ key: 'x' })).rejects.toBeInstanceOf(
      MCPEventConfigError,
    )
    await expect(api.unsubscribe({ key: 'x' })).rejects.toBeInstanceOf(
      MCPEventConfigError,
    )
  })
})
