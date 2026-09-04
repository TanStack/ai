import { test, expect } from './fixtures'

test.describe('generateWorld activity', () => {
  test('mints a Reactor session token through reactorWorld', async ({
    request,
  }) => {
    const res = await request.post('/api/world', {
      data: { prompt: 'A neon cyberpunk city at night' },
    })
    expect(res.ok()).toBe(true)

    const body = (await res.json()) as {
      ok: boolean
      token?: string
      model?: string
      prompt?: string
      status?: string
      expiresAt?: number
      error?: string
    }

    expect(body.error ?? null).toBeNull()
    expect(body.ok).toBe(true)
    expect(body.token).toBe('jwt-e2e')
    expect(body.model).toBe('reactor/visko-orbis-stable')
    expect(body.prompt).toBe('A neon cyberpunk city at night')
    expect(body.status).toBe('ready')
    expect(body.expiresAt).toBe(1_800_000_000 * 1000)
  })

  test('returns 500 when the token endpoint fails', async ({ request }) => {
    const res = await request.post('/api/world', {
      data: { prompt: 'A neon cyberpunk city at night', fail: true },
    })
    expect(res.status()).toBe(500)
    const body = (await res.json()) as { ok: boolean; error?: string }
    expect(body.ok).toBe(false)
    expect(body.error).toMatch(/Reactor token request failed \(402/)
  })
})
