import { describe, expect, it, vi } from 'vitest'
import { SecureMcpError } from '../src/types'
import { createEgress } from '../src/egress'

describe('createEgress', () => {
  it('allows a listed origin and passes the HTTP status through', async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response('body', { status: 404 }),
    )
    const egress = createEgress({
      allow: ['https://api.hue.local'],
      fetch: fetchImpl,
    })
    const res = await egress('https://api.hue.local/lights')
    expect(res.status).toBe(404)
    // redirect is forced to error, not followed.
    expect(fetchImpl.mock.calls[0]![1]?.redirect).toBe('error')
  })

  it('refuses an off-list origin with egress_denied and reports it', async () => {
    const onDenied = vi.fn()
    const egress = createEgress({
      allow: ['https://api.hue.local'],
      onDenied,
      fetch: async () => new Response('should not run'),
    })
    await expect(egress('https://evil.test/steal')).rejects.toMatchObject({
      code: 'egress_denied',
    })
    expect(onDenied).toHaveBeenCalledWith('https://evil.test')
  })

  it('maps a network failure to backend_unavailable', async () => {
    const egress = createEgress({
      allow: ['https://api.hue.local'],
      fetch: async () => {
        throw new Error('ECONNREFUSED')
      },
    })
    await expect(egress('https://api.hue.local/x')).rejects.toMatchObject({
      code: 'backend_unavailable',
    })
  })

  it('rejects a non-URL allowlist entry at build time', () => {
    expect(() => createEgress({ allow: ['not a url'] })).toThrow(SecureMcpError)
  })
})
