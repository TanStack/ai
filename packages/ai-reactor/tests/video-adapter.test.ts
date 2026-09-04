import { describe, expect, it, vi } from 'vitest'
import { generateLive } from '@tanstack/ai'
import {
  createReactorVideo,
  isReactorVideoModel,
  reactorVideo,
  REACTOR_VIDEO_SLUGS,
} from '../src'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Reactor video adapter', () => {
  it('narrows known video model ids', () => {
    expect(isReactorVideoModel('helios')).toBe(true)
    expect(isReactorVideoModel('fast-h3')).toBe(true)
    expect(isReactorVideoModel('visko-orbis-stable')).toBe(false)
    expect(isReactorVideoModel('lingbot')).toBe(false)
  })

  it('mints a scoped session token and returns it from generateLive', async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe('https://api.reactor.inc/tokens')
        expect(init?.method).toBe('POST')
        expect(init?.headers).toMatchObject({
          'Reactor-API-Key': 'rk_test',
          'Content-Type': 'application/json',
        })
        const body = JSON.parse(String(init?.body)) as {
          authorization_details: Array<{
            resources: { models: { match: Array<string> } }
          }>
        }
        expect(body.authorization_details[0]!.resources.models.match).toEqual([
          'reactor/helios',
        ])
        return jsonResponse({ jwt: 'jwt-live', expires_at: 1_800_000_000 })
      },
    )

    const result = await generateLive({
      adapter: reactorVideo('helios', {
        apiKey: 'rk_test',
        fetch: fetchImpl,
      }),
      prompt: 'A neon cyberpunk city at night, slow aerial drift',
      debug: false,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(result.token).toBe('jwt-live')
    expect(result.model).toBe(REACTOR_VIDEO_SLUGS.helios)
    expect(result.prompt).toBe(
      'A neon cyberpunk city at night, slow aerial drift',
    )
    expect(result.status).toBe('ready')
    expect(result.expiresAt).toBe(1_800_000_000 * 1000)
  })

  it('createReactorVideo passes the explicit key', async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse({ jwt: 'jwt-create', expires_at: 1_800_000_000 }),
    )

    await generateLive({
      adapter: createReactorVideo('fast-h3', 'rk_explicit', {
        fetch: fetchImpl,
      }),
      prompt: 'rain-slicked night market',
      debug: false,
    })

    const init = fetchImpl.mock.calls[0]![1]
    expect(init?.headers).toMatchObject({ 'Reactor-API-Key': 'rk_explicit' })
    const body = JSON.parse(String(init?.body)) as {
      authorization_details: Array<{
        resources: { models: { match: Array<string> } }
      }>
    }
    expect(body.authorization_details[0]!.resources.models.match).toEqual([
      'reactor/fast-h3',
    ])
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
        adapter: reactorVideo('helios', {
          apiKey: 'rk_test',
          fetch: fetchImpl,
        }),
        prompt: 'a forest',
        debug: false,
      }),
    ).rejects.toThrow(
      /Reactor token request failed \(402 Payment Required\): no credits/,
    )
  })

  it('throws when REACTOR_API_KEY is missing', () => {
    const previous = process.env.REACTOR_API_KEY
    delete process.env.REACTOR_API_KEY
    try {
      expect(() => reactorVideo('helios')).toThrow(/REACTOR_API_KEY/)
    } finally {
      if (previous === undefined) {
        delete process.env.REACTOR_API_KEY
      } else {
        process.env.REACTOR_API_KEY = previous
      }
    }
  })
})
