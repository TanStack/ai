import { test, expect } from './fixtures'

test.describe('generateLiveVideo activity', () => {
  test('mints a Reactor session token through reactorVideo', async ({
    request,
  }) => {
    const res = await request.post('/api/video-live', {
      data: { prompt: 'A neon cyberpunk city at night', model: 'helios' },
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
    expect(body.model).toBe('reactor/helios')
    expect(body.prompt).toBe('A neon cyberpunk city at night')
    expect(body.status).toBe('ready')
    expect(body.expiresAt).toBe(1_800_000_000 * 1000)
  })

  test('mints a fal realtime token through falLiveVideo', async ({ request }) => {
    const before = Date.now()
    const res = await request.post('/api/video-live', {
      data: {
        prompt: 'Live shopping stream: a host holds up a gold watch',
        model: 'minimax/h3-max/director',
      },
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
    expect(body.token).toBe('jwt-fal-e2e')
    expect(body.model).toBe('fal-ai/minimax-h3-max-director')
    expect(body.status).toBe('ready')
    expect(body.expiresAt).toBeGreaterThan(before + 290_000)
    expect(body.expiresAt).toBeLessThan(before + 310_000)
  })
})
