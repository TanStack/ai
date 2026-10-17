import { describe, expect, it } from 'vitest'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { createMCPEventSecret } from '../../src/events/secret'
import { MCP_EVENTS_EXTENSION } from '../../src/events/capability'
import { createTestEventsServer, eventsHttpFetch } from './events-server'
import { passThroughSchema } from './pass-through-schema'
import type { MCPEventDefinition } from '../../src/events/types'

const webhookEvent = (
  name: string,
  extra: Partial<MCPEventDefinition> = {},
): MCPEventDefinition => ({
  name,
  delivery: ['webhook'],
  inputSchema: {},
  payloadSchema: true,
  ...extra,
})

async function withClient<T>(
  events: ReturnType<typeof createTestEventsServer>,
  run: (client: Client) => Promise<T>,
) {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await events.server.connect(serverTransport)
  const client = new Client({ name: 'tester', version: '1.0.0' })
  await client.connect(clientTransport)
  try {
    return await run(client)
  } finally {
    await client.close()
  }
}

function sseInitializeCapabilities(text: string): unknown {
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice('data:'.length).trimStart()
    if (payload.length === 0) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(payload)
    } catch {
      continue
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('result' in parsed)
    ) {
      continue
    }
    const result = parsed.result
    if (
      typeof result !== 'object' ||
      result === null ||
      !('capabilities' in result)
    ) {
      continue
    }
    return result.capabilities
  }
  return undefined
}

describe('createTestEventsServer', () => {
  it('advertises extensions["io.modelcontextprotocol/events"]', async () => {
    const events = createTestEventsServer({ verify: 'skip' })
    expect(events.capabilities).toMatchObject({
      extensions: { [MCP_EVENTS_EXTENSION]: {} },
    })
    await withClient(events, async (client) => {
      expect(
        client.getServerCapabilities()?.extensions?.[MCP_EVENTS_EXTENSION],
      ).toEqual({})
    })
  })

  it('paginates events/list by pageSize', async () => {
    const events = createTestEventsServer({
      events: [webhookEvent('a'), webhookEvent('b'), webhookEvent('c')],
      pageSize: 1,
      verify: 'skip',
    })
    await withClient(events, async (client) => {
      const page1 = await client.request(
        { method: 'events/list', params: {} },
        passThroughSchema,
      )
      expect(page1).toMatchObject({
        events: [{ name: 'a' }],
        nextCursor: '1',
      })
      const page2 = await client.request(
        { method: 'events/list', params: { cursor: '1' } },
        passThroughSchema,
      )
      expect(page2).toMatchObject({ events: [{ name: 'b' }] })
    })
  })

  it('derives the same id for the same (principal,url,name,arguments) and a different id when arguments differ', async () => {
    const secret = createMCPEventSecret()
    const events = createTestEventsServer({
      verify: 'skip',
      allowHttpLoopback: true,
    })
    await withClient(events, async (client) => {
      const params = {
        name: 'incident.created',
        arguments: { repo: 'acme' },
        delivery: {
          mode: 'webhook',
          url: 'http://127.0.0.1/hook',
          secret,
        },
        cursor: null,
      }
      const first = await client.request(
        { method: 'events/subscribe', params },
        passThroughSchema,
      )
      const second = await client.request(
        { method: 'events/subscribe', params },
        passThroughSchema,
      )
      expect(first).toMatchObject({ id: (second as { id: string }).id })
      const other = await client.request(
        {
          method: 'events/subscribe',
          params: { ...params, arguments: { repo: 'other' } },
        },
        passThroughSchema,
      )
      expect((other as { id: string }).id).not.toBe(
        (first as { id: string }).id,
      )
    })
  })

  it('fails subscribe with -32027 challenge_failed when deliver echoes the wrong challenge', async () => {
    const events = createTestEventsServer({
      verify: 'challenge',
      allowHttpLoopback: true,
      deliver: async () =>
        Response.json({ challenge: 'not-the-nonce' }, { status: 200 }),
    })
    await withClient(events, async (client) => {
      await expect(
        client.request(
          {
            method: 'events/subscribe',
            params: {
              name: 'incident.created',
              arguments: {},
              delivery: {
                mode: 'webhook',
                url: 'http://127.0.0.1/hook',
                secret: createMCPEventSecret(),
              },
              cursor: null,
            },
          },
          passThroughSchema,
        ),
      ).rejects.toMatchObject({
        code: -32027,
        data: { reason: 'challenge_failed' },
      })
    })
  })

  it('retries on 503 then stops after maxAttempts', async () => {
    let calls = 0
    const events = createTestEventsServer({
      verify: 'skip',
      allowHttpLoopback: true,
      maxAttempts: 3,
      deliver: async () => {
        calls += 1
        return new Response(null, { status: 503 })
      },
    })
    await withClient(events, async (client) => {
      await client.request(
        {
          method: 'events/subscribe',
          params: {
            name: 'incident.created',
            arguments: {},
            delivery: {
              mode: 'webhook',
              url: 'http://127.0.0.1/hook',
              secret: createMCPEventSecret(),
            },
            cursor: null,
          },
        },
        passThroughSchema,
      )
    })
    const result = await events.emit('incident.created', { ok: true })
    expect(result[0]).toEqual({ status: 503, attempts: 3 })
    expect(calls).toBe(3)
  })

  it('regenerates webhook-timestamp per attempt', async () => {
    const stamps: Array<string | null> = []
    let calls = 0
    const events = createTestEventsServer({
      verify: 'skip',
      allowHttpLoopback: true,
      maxAttempts: 2,
      deliver: async (request) => {
        stamps.push(request.headers.get('webhook-timestamp'))
        calls += 1
        if (calls === 1) {
          await new Promise((resolve) => setTimeout(resolve, 1100))
          return new Response(null, { status: 503 })
        }
        return new Response(null, { status: 204 })
      },
    })
    await withClient(events, async (client) => {
      await client.request(
        {
          method: 'events/subscribe',
          params: {
            name: 'incident.created',
            arguments: {},
            delivery: {
              mode: 'webhook',
              url: 'http://127.0.0.1/hook',
              secret: createMCPEventSecret(),
            },
            cursor: null,
          },
        },
        passThroughSchema,
      )
    })
    await events.emit('incident.created', { ok: true })
    expect(stamps).toHaveLength(2)
    expect(stamps[0]).not.toBe(stamps[1])
  })

  it('does not retry 410', async () => {
    let calls = 0
    const events = createTestEventsServer({
      verify: 'skip',
      allowHttpLoopback: true,
      maxAttempts: 3,
      deliver: async () => {
        calls += 1
        return new Response(null, { status: 410 })
      },
    })
    await withClient(events, async (client) => {
      await client.request(
        {
          method: 'events/subscribe',
          params: {
            name: 'incident.created',
            arguments: {},
            delivery: {
              mode: 'webhook',
              url: 'http://127.0.0.1/hook',
              secret: createMCPEventSecret(),
            },
            cursor: null,
          },
        },
        passThroughSchema,
      )
    })
    const result = await events.emit('incident.created', { ok: true })
    expect(result[0]).toEqual({ status: 410, attempts: 1 })
    expect(calls).toBe(1)
  })

  it('clamps ttlMs below min up to the minimum instead of rejecting', async () => {
    const min = 60_000
    const events = createTestEventsServer({
      verify: 'skip',
      allowHttpLoopback: true,
      ttlMs: { default: 3_600_000, min },
    })
    const before = Date.now()
    await withClient(events, async (client) => {
      const result = await client.request(
        {
          method: 'events/subscribe',
          params: {
            name: 'incident.created',
            arguments: {},
            delivery: {
              mode: 'webhook',
              url: 'http://127.0.0.1/hook',
              secret: createMCPEventSecret(),
            },
            cursor: null,
            ttlMs: 1,
          },
        },
        passThroughSchema,
      )
      const refreshBefore = (result as { refreshBefore: string }).refreshBefore
      const at = Date.parse(refreshBefore)
      expect(at).toBeGreaterThanOrEqual(before + min - 50)
      expect(at).toBeLessThan(before + min + 5_000)
    })
  })

  it('caches successful verification per principal and URL', async () => {
    let verifications = 0
    const events = createTestEventsServer({
      verify: 'challenge',
      allowHttpLoopback: true,
      deliver: async (request) => {
        const body: unknown = await request.clone().json()
        if (
          typeof body === 'object' &&
          body !== null &&
          'type' in body &&
          body.type === 'verification'
        ) {
          verifications += 1
          const challenge =
            'challenge' in body && typeof body.challenge === 'string'
              ? body.challenge
              : ''
          return Response.json({ challenge }, { status: 200 })
        }
        return new Response(null, { status: 204 })
      },
    })
    await withClient(events, async (client) => {
      const params = {
        name: 'incident.created',
        arguments: {},
        delivery: {
          mode: 'webhook',
          url: 'http://127.0.0.1/hook',
          secret: createMCPEventSecret(),
        },
        cursor: null,
      }
      await client.request(
        { method: 'events/subscribe', params },
        passThroughSchema,
      )
      expect(verifications).toBe(1)
      await client.request(
        { method: 'events/subscribe', params },
        passThroughSchema,
      )
      expect(verifications).toBe(1)
      await client.request(
        {
          method: 'events/subscribe',
          params: {
            ...params,
            delivery: {
              ...params.delivery,
              url: 'http://127.0.0.1/other',
              secret: createMCPEventSecret(),
            },
          },
        },
        passThroughSchema,
      )
      expect(verifications).toBe(2)
    })
  })

  it('injects top-level events into a legacy initialize SSE reply', async () => {
    const events = createTestEventsServer({
      verify: 'skip',
      advertise: { extensions: false, events: true },
    })
    const response = await eventsHttpFetch(events)(
      new Request('https://mcp.example.com/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'raw', version: '1.0.0' },
          },
        }),
      }),
    )
    expect(response.headers.get('content-type') ?? '').toContain(
      'text/event-stream',
    )
    const text = await response.text()
    const capabilities = sseInitializeCapabilities(text)
    expect(capabilities).toMatchObject({ events: {} })
  })

  it('returns HTTP 400 HeaderMismatch (-32020) for a mismatched Mcp-Name', async () => {
    const events = createTestEventsServer({ verify: 'skip' })
    const fetchImpl = eventsHttpFetch(events)
    const response = await fetchImpl(
      new Request('https://mcp.example.com/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'mcp-name': 'other.event',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 7,
          method: 'events/subscribe',
          params: { name: 'incident.created' },
        }),
      }),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      jsonrpc: '2.0',
      id: 7,
      error: { code: -32020, message: 'HeaderMismatch' },
    })
  })
})
