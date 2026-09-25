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

  test('returns a Marble viewer URL through worldlabsWorld', async ({
    request,
  }) => {
    const res = await request.post('/api/world', {
      data: {
        prompt: 'A mystical forest with glowing mushrooms',
        provider: 'worldlabs',
      },
    })
    const body = (await res.json()) as {
      ok: boolean
      url?: string
      worldId?: string
      operationId?: string
      model?: string
      prompt?: string
      status?: string
      error?: string
    }

    expect(body.error ?? null).toBeNull()
    expect(res.ok()).toBe(true)
    expect(body.ok).toBe(true)
    expect(body.url).toBe('https://marble.worldlabs.ai/world/world-e2e')
    expect(body.worldId).toBe('world-e2e')
    expect(body.operationId).toBe('op-e2e')
    expect(body.model).toBe('marble-1.1')
    expect(body.prompt).toBe('A mystical forest with glowing mushrooms')
    expect(body.status).toBe('ready')
  })

  test('returns 500 when World Labs generate fails', async ({ request }) => {
    const res = await request.post('/api/world', {
      data: {
        prompt: 'A mystical forest with glowing mushrooms',
        provider: 'worldlabs',
        fail: true,
      },
    })
    expect(res.status()).toBe(500)
    const body = (await res.json()) as { ok: boolean; error?: string }
    expect(body.ok).toBe(false)
    expect(body.error).toMatch(/World Labs generate request failed \(402/)
  })
})
