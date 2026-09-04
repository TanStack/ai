import { test, expect } from './fixtures'

test.describe('generateWorld activity', () => {
  test('returns a session token payload for the client', async ({
    request,
  }) => {
    const res = await request.post('/api/world', {
      data: { prompt: 'A neon cyberpunk city at night' },
    })
    expect(res.ok()).toBe(true)

    const body = (await res.json()) as {
      ok: boolean
      model?: string
      prompt?: string
      status?: string
      hasToken?: boolean
      error?: string
    }

    expect(body.error ?? null).toBeNull()
    expect(body.ok).toBe(true)
    expect(body.model).toBe('reactor/visko-orbis-stable')
    expect(body.prompt).toBe('A neon cyberpunk city at night')
    expect(body.status).toBe('ready')
    expect(body.hasToken).toBe(true)
  })
})
