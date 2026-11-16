import { describe, expect, it } from 'vitest'
import { hashToken } from '../src/auth'
import { preflight, tailscaleCommand } from '../src/deploy'
import type { ClientRecord } from '../src/types'

const good: ClientRecord = {
  id: 'alice',
  tokenHash: hashToken('t'),
  scopes: ['read'],
}

describe('preflight', () => {
  it('passes when every rule holds', () => {
    const r = preflight({
      clients: [good],
      egressDenyByDefault: true,
      auditOn: true,
      notifierOn: true,
    })
    expect(r.ok).toBe(true)
    expect(r.problems).toEqual([])
  })

  it('flags unhashed tokens, open egress, and off audit/notifier', () => {
    const r = preflight({
      clients: [{ id: 'bob', tokenHash: 'plaintext', scopes: [] }],
      egressDenyByDefault: false,
      auditOn: false,
      notifierOn: false,
    })
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toMatch(/SHA-256/)
    expect(r.problems.join(' ')).toMatch(/Egress/)
    expect(r.problems.join(' ')).toMatch(/audit/)
    expect(r.problems.join(' ')).toMatch(/notifier/)
  })

  it('flags an empty client list', () => {
    const r = preflight({
      clients: [],
      egressDenyByDefault: true,
      auditOn: true,
      notifierOn: true,
    })
    expect(r.ok).toBe(false)
  })
})

describe('tailscaleCommand', () => {
  it('defaults to tailnet-only serve', () => {
    const r = tailscaleCommand({ port: 8787 })
    expect(r.command).toContain('tailscale serve')
    expect(r.command).toContain('http://127.0.0.1:8787')
  })

  it('uses funnel when public', () => {
    const r = tailscaleCommand({ port: 8787, public: true })
    expect(r.command).toContain('tailscale funnel')
    expect(r.note).toMatch(/not a secret/)
  })
})
