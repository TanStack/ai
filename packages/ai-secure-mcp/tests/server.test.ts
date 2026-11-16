import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { hashToken } from '../src/auth'
import { createSecureMcpServer } from '../src/server'
import type { ClientRecord } from '../src/types'

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
      createSecureMcpServer({ ...base(), funnel: { port: 8787, public: true } }),
    ).toThrow(/Refusing to expose a public funnel/)
  })

  it('exposes the tailscale command when funnel is set', () => {
    const server = createSecureMcpServer({ ...base(), funnel: { port: 8787 } })
    expect(server.tailscale?.command).toContain('tailscale serve')
  })
})
