import { describe, expect, it, vi } from 'vitest'
import { generateLive } from '@tanstack/ai'
import { createFalLive, falLive, isFalLiveModel } from '../src'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('fal live adapter', () => {
  it('narrows the Director model id', () => {
    expect(isFalLiveModel('minimax/h3-max/director')).toBe(true)
    expect(isFalLiveModel('fal-ai/kling-video/v3/pro/text-to-video')).toBe(
      false,
    )
  })

  it('mints a scoped realtime token and returns it from generateLive', async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe('https://rest.fal.ai/tokens/realtime')
        expect(init?.method).toBe('POST')
        expect(init?.headers).toMatchObject({
          Authorization: 'Key fal_test',
          'Content-Type': 'application/json',
        })
        const body = JSON.parse(String(init?.body)) as {
          allowed_apps: Array<string>
          duration: number
        }
        expect(body.allowed_apps).toEqual(['minimax/h3-max/director'])
        expect(body.duration).toBe(300)
        return jsonResponse({ token: 'jwt-fal' })
      },
    )

    const result = await generateLive({
      adapter: falLive('minimax/h3-max/director', {
        apiKey: 'fal_test',
        fetch: fetchImpl,
      }),
      prompt: 'Live shopping stream: a host holds up a gold watch',
      debug: false,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(result.token).toBe('jwt-fal')
    expect(result.model).toBe('minimax/h3-max/director')
    expect(result.prompt).toBe(
      'Live shopping stream: a host holds up a gold watch',
    )
    expect(result.status).toBe('ready')
    expect(result.expiresAt).toBeGreaterThan(Date.now())
  })

  it('honors tokenDuration in modelOptions', async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { duration: number }
        expect(body.duration).toBe(120)
        return jsonResponse({ token: 'jwt-short' })
      },
    )

    await generateLive({
      adapter: falLive('minimax/h3-max/director', {
        apiKey: 'fal_test',
        fetch: fetchImpl,
      }),
      prompt: 'a news desk',
      modelOptions: { tokenDuration: 120 },
      debug: false,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('createFalLive passes the explicit key', async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse({ token: 'jwt-create' }),
    )

    await generateLive({
      adapter: createFalLive('minimax/h3-max/director', 'fal_explicit', {
        fetch: fetchImpl,
      }),
      prompt: 'a violinist on a rooftop',
      debug: false,
    })

    const init = fetchImpl.mock.calls[0]![1]
    expect(init?.headers).toMatchObject({ Authorization: 'Key fal_explicit' })
  })

  it('throws when the token endpoint fails', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('no credits', {
          status: 402,
          statusText: 'Payment Required',
        }),
    )

    await expect(
      generateLive({
        adapter: falLive('minimax/h3-max/director', {
          apiKey: 'fal_test',
          fetch: fetchImpl,
        }),
        prompt: 'a forest',
        debug: false,
      }),
    ).rejects.toThrow(
      /fal realtime token request failed \(402 Payment Required\): no credits/,
    )
  })

  it('throws when FAL_KEY is missing', () => {
    const previous = process.env.FAL_KEY
    delete process.env.FAL_KEY
    try {
      expect(() => falLive('minimax/h3-max/director')).toThrow(/FAL_KEY/)
    } finally {
      if (previous === undefined) {
        delete process.env.FAL_KEY
      } else {
        process.env.FAL_KEY = previous
      }
    }
  })
})
