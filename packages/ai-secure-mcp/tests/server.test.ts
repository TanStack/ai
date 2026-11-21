import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { hashToken } from '../src/auth'
import { silentNotifier } from '../src/notifier'
import { createSecureMcpServer } from '../src/server'
import type { ClientRecord, SecurityEvent } from '../src/types'

const ping = toolDefinition({
  name: 'ping',
  description: 'Health ping',
  inputSchema: z.object({}),
}).server(async () => ({ pong: true }))

const alice: ClientRecord = {
  id: 'alice',
  tokenHash: hashToken('alice-token'),
  scopes: ['read'],
}

function base() {
  return {
    name: 'home',
    version: '1.0.0',
    tools: [ping],
    clients: [alice],
    egress: ['https://api.hue.local'],
    audit: false as const,
  }
}

function mcpRequest(token?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token !== undefined) headers.authorization = `Bearer ${token}`
  return new Request('https://mcp.local/', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    }),
  })
}

describe('createSecureMcpServer — auth pipeline', () => {
  it('returns 401 with no token', async () => {
    const server = createSecureMcpServer(base())
    const res = await server.fetch(mcpRequest())
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toBe('Bearer')
  })

  it('returns 401 for a bad token', async () => {
    const server = createSecureMcpServer(base())
    expect((await server.fetch(mcpRequest('wrong'))).status).toBe(401)
  })

  it('does not 401 a valid token (request reaches the inner server)', async () => {
    const server = createSecureMcpServer(base())
    const res = await server.fetch(mcpRequest('alice-token'))
    expect(res.status).not.toBe(401)
  })

  it('rate limits a client after the configured number of calls', async () => {
    const server = createSecureMcpServer({
      ...base(),
      rateLimit: { limit: 1, windowMs: 60_000 },
    })
    expect((await server.fetch(mcpRequest('alice-token'))).status).not.toBe(429)
    expect((await server.fetch(mcpRequest('alice-token'))).status).toBe(429)
  })
})

describe('createSecureMcpServer — go-live safety', () => {
  it('computes the preflight from the config', () => {
    const server = createSecureMcpServer(base())
    // audit off + silent notifier => not ready for public exposure.
    expect(server.preflight.ok).toBe(false)
    expect(server.preflight.problems.join(' ')).toMatch(/audit/)
  })

  it('refuses to build a public funnel while the preflight fails', () => {
    expect(() =>
      createSecureMcpServer({
        ...base(),
        funnel: { port: 8787, public: true },
      }),
    ).toThrow(/Refusing to expose a public funnel/)
  })

  it('exposes the tailscale command when funnel is set', () => {
    const server = createSecureMcpServer({ ...base(), funnel: { port: 8787 } })
    expect(server.tailscale?.command).toContain('tailscale serve')
  })
})

describe('createSecureMcpServer — preflight rules', () => {
  async function auditPath() {
    return join(await mkdtemp(join(tmpdir(), 'secure-mcp-')), 'audit.jsonl')
  }

  it('allows a public funnel with an empty egress allowlist', async () => {
    const server = createSecureMcpServer({
      ...base(),
      egress: [],
      audit: { path: await auditPath() },
      notify: { notify: async () => {} },
      funnel: { port: 8787, public: true },
    })
    expect(server.preflight).toEqual({ ok: true, problems: [] })
  })

  it('counts silentNotifier() as notifier off', async () => {
    const server = createSecureMcpServer({
      ...base(),
      audit: { path: await auditPath() },
      notify: silentNotifier(),
    })
    expect(server.preflight.ok).toBe(false)
    expect(server.preflight.problems.join(' ')).toMatch(/notifier/)
  })
})

describe('createSecureMcpServer — auth failure flood', () => {
  it('audits and notifies only the first failures in a window', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'secure-mcp-')), 'a.jsonl')
    const events: Array<SecurityEvent> = []
    const server = createSecureMcpServer({
      ...base(),
      audit: { path },
      notify: { notify: async (event) => void events.push(event) },
    })
    for (let i = 0; i < 25; i++) {
      expect((await server.fetch(mcpRequest('wrong'))).status).toBe(401)
    }
    const lines = (await readFile(path, 'utf8')).trim().split('\n')
    expect(lines).toHaveLength(10)
    expect(events).toHaveLength(10)
  })
})

describe('createSecureMcpServer — config it refuses', () => {
  it('refuses a duplicate client id', () => {
    const twin = { ...alice, tokenHash: hashToken('other-token') }
    expect(() =>
      createSecureMcpServer({ ...base(), clients: [alice, twin] }),
    ).toThrow(/more than once/)
  })

  it('refuses an expiresAt in milliseconds', () => {
    expect(() =>
      createSecureMcpServer({
        ...base(),
        clients: [{ ...alice, expiresAt: Date.now() + 60_000 }],
      }),
    ).toThrow(/Unix seconds/)
  })

  it('refuses a policy that names an unknown tool', () => {
    expect(() =>
      createSecureMcpServer({
        ...base(),
        policy: { scopes: { pong: 'read' } },
      }),
    ).toThrow(/not in `tools`/)
  })
})

describe('createSecureMcpServer — a real tool call', () => {
  function call(token: string, name: string) {
    return new Request('https://mcp.local/', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: {} },
      }),
    })
  }

  it('runs a tool for a client with the scope, and refuses one without', async () => {
    const bob: ClientRecord = {
      id: 'bob',
      tokenHash: hashToken('bob-token'),
      scopes: [],
    }
    const server = createSecureMcpServer({
      ...base(),
      clients: [alice, bob],
      policy: { scopes: { ping: 'read' } },
    })
    // The guard reads the client the envelope put in the tool context, so
    // this fails if the context does not reach the tool.
    const ok = await server.fetch(call('alice-token', 'ping'))
    expect(ok.status).toBe(200)
    expect(await ok.text()).toContain('"structuredContent":{"pong":true}')

    const denied = await server.fetch(call('bob-token', 'ping'))
    const body = await denied.text()
    expect(body).toContain('"isError":true')
    expect(body).not.toContain('pong')
  })
})
