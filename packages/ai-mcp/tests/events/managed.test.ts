import { describe, expect, it, vi } from 'vitest'
import { InMemoryTransport } from '@modelcontextprotocol/client'
import { createMCPClient } from '../../src/client'
import { MCPEventConfigError } from '../../src/errors'
import { createTestEventsServer } from '../helpers/events-server'
import type {
  MCPEventAdapter,
  MCPEventOperations,
  ManagedMCPSubscription,
} from '../../src/events/types'

function ops(extra: Partial<MCPEventOperations> = {}): MCPEventOperations {
  const record: ManagedMCPSubscription = {
    id: 'managed_1',
    name: 'incident.created',
    arguments: {},
    status: 'active',
    expiresAt: null,
    idempotencyKey: 'k1',
  }
  return {
    subscribe: async (input) => ({
      ...record,
      name: input.name,
      arguments: input.arguments,
      idempotencyKey: input.idempotencyKey,
    }),
    getSubscription: async (id) => (id === record.id ? record : undefined),
    listSubscriptions: async () => [record],
    unsubscribe: async () => {},
    ...extra,
  }
}

describe('managed MCP Events', () => {
  it('calls createAdapter once, synchronously, before connect', async () => {
    const events = createTestEventsServer({ verify: 'skip' })
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair()
    const start = clientTransport.start.bind(clientTransport)
    const startSpy = vi.fn((...args: Parameters<typeof start>) =>
      start(...args),
    )
    clientTransport.start = startSpy
    const createAdapter = vi.fn(() => {
      expect(startSpy).not.toHaveBeenCalled()
      return ops()
    })
    await events.server.connect(serverTransport)
    await createMCPClient({
      transport: clientTransport,
      experimental_events: { adapter: { createAdapter } },
    })
    expect(createAdapter).toHaveBeenCalledTimes(1)
    expect(startSpy).toHaveBeenCalled()
  })

  it('passes {type:http,url} for an http config, {type:sse,url} for sse, {type:custom} for a Transport instance', async () => {
    const seen: Array<unknown> = []
    const adapter: MCPEventAdapter = {
      createAdapter(context) {
        seen.push(context)
        return ops()
      },
    }
    await createMCPClient({
      transport: {
        type: 'http',
        url: 'https://mcp.example.com/mcp',
        fetch: async () => new Response('nope', { status: 500 }),
      },
      experimental_events: { adapter },
    }).catch(() => undefined)
    await createMCPClient({
      transport: {
        type: 'sse',
        url: 'https://mcp.example.com/sse',
        fetch: async () => new Response('nope', { status: 500 }),
      },
      experimental_events: { adapter },
    }).catch(() => undefined)
    const events = createTestEventsServer({ verify: 'skip' })
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair()
    await events.server.connect(serverTransport)
    await createMCPClient({
      transport: clientTransport,
      experimental_events: { adapter },
    })
    expect(seen).toEqual([
      { transport: { type: 'http', url: 'https://mcp.example.com/mcp' } },
      { transport: { type: 'sse', url: 'https://mcp.example.com/sse' } },
      { transport: { type: 'custom' } },
    ])
  })

  it('does not pass headers, fetch or authProvider to createAdapter', async () => {
    let context: unknown
    await createMCPClient({
      transport: {
        type: 'http',
        url: 'https://mcp.example.com/mcp',
        headers: { Authorization: 'Bearer x' },
        fetch: async () => new Response('nope', { status: 500 }),
      },
      experimental_events: {
        adapter: {
          createAdapter(value) {
            context = value
            return ops()
          },
        },
      },
    }).catch(() => undefined)
    expect(context).toEqual({
      transport: { type: 'http', url: 'https://mcp.example.com/mcp' },
    })
    expect(JSON.stringify(context)).not.toContain('Authorization')
    expect(JSON.stringify(context)).not.toContain('fetch')
    expect(JSON.stringify(context)).not.toContain('authProvider')
  })

  it('rejects a createAdapter that returns a Promise', async () => {
    await expect(
      createMCPClient({
        transport: {
          type: 'http',
          url: 'https://mcp.example.com/mcp',
          fetch: async () => new Response('nope', { status: 500 }),
        },
        experimental_events: {
          adapter: {
            createAdapter: () => Promise.resolve(ops()) as never,
          },
        },
      }),
    ).rejects.toBeInstanceOf(MCPEventConfigError)
  })

  it('rejects operations missing getSubscription', async () => {
    await expect(
      createMCPClient({
        transport: {
          type: 'http',
          url: 'https://mcp.example.com/mcp',
          fetch: async () => new Response('nope', { status: 500 }),
        },
        experimental_events: {
          adapter: {
            createAdapter: () =>
              ({
                subscribe: async () => {
                  throw new Error('unused')
                },
                listSubscriptions: async () => [],
                unsubscribe: async () => {},
              }) as never,
          },
        },
      }),
    ).rejects.toMatchObject({
      name: 'MCPEventConfigError',
      reason: 'adapter operations missing getSubscription',
    })
  })

  it('delegates subscribe/getSubscription/listSubscriptions/unsubscribe unchanged and preserves idempotencyKey', async () => {
    const events = createTestEventsServer({ verify: 'skip' })
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair()
    await events.server.connect(serverTransport)
    const calls: Array<string> = []
    const operations = ops({
      subscribe: async (input) => {
        calls.push('subscribe')
        expect(input.idempotencyKey).toBe('incident:acme')
        return {
          id: 'managed_1',
          name: input.name,
          arguments: input.arguments,
          status: 'active',
          expiresAt: null,
          idempotencyKey: input.idempotencyKey,
        }
      },
      getSubscription: async (id) => {
        calls.push(`get:${id}`)
        return {
          id,
          name: 'incident.created',
          arguments: {},
          status: 'active',
          expiresAt: null,
        }
      },
      listSubscriptions: async () => {
        calls.push('list')
        return []
      },
      unsubscribe: async (id) => {
        calls.push(`unsub:${id}`)
      },
    })
    const client = await createMCPClient({
      transport: clientTransport,
      experimental_events: { adapter: { createAdapter: () => operations } },
    })
    const created = await client.experimental_events.subscribe({
      name: 'incident.created',
      arguments: { repo: 'acme' },
      idempotencyKey: 'incident:acme',
      ttlMs: 3_600_000,
    })
    expect(created.idempotencyKey).toBe('incident:acme')
    await client.experimental_events.getSubscription('managed_1')
    await client.experimental_events.listSubscriptions()
    await client.experimental_events.unsubscribe('managed_1')
    expect(calls).toEqual([
      'subscribe',
      'get:managed_1',
      'list',
      'unsub:managed_1',
    ])
    await client.close()
  })

  it('list() still calls events/list over MCP', async () => {
    const events = createTestEventsServer({ verify: 'skip' })
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair()
    await events.server.connect(serverTransport)
    const client = await createMCPClient({
      transport: clientTransport,
      experimental_events: { adapter: { createAdapter: () => ops() } },
    })
    const listed = await client.experimental_events.list()
    expect(listed.map((item) => item.name)).toEqual(['incident.created'])
    expect(events.requests.some((row) => row.method === 'events/list')).toBe(
      true,
    )
    await client.close()
  })

  it('has no refresh member', async () => {
    const events = createTestEventsServer({ verify: 'skip' })
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair()
    await events.server.connect(serverTransport)
    const client = await createMCPClient({
      transport: clientTransport,
      experimental_events: { adapter: { createAdapter: () => ops() } },
    })
    expect('refresh' in client.experimental_events).toBe(false)
    await client.close()
  })
})
