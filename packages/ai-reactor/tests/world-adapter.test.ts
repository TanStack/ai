import { describe, expect, it, vi } from 'vitest'
import { generateWorld } from '@tanstack/ai'
import {
  createReactorWorld,
  isReactorWorldModel,
  reactorWorld,
  REACTOR_WORLD_SLUGS,
} from '../src'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Reactor world adapter', () => {
  it('narrows known world model ids', () => {
    expect(isReactorWorldModel('visko-orbis-stable')).toBe(true)
    expect(isReactorWorldModel('not-a-model')).toBe(false)
  })

  it('mints a scoped session token and returns it from generateWorld', async () => {
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
          'reactor/visko-orbis-stable',
        ])
        return jsonResponse({ jwt: 'jwt-live', expires_at: 1_800_000_000 })
      },
    )

    const result = await generateWorld({
      adapter: reactorWorld('visko-orbis-stable', {
        apiKey: 'rk_test',
        fetch: fetchImpl,
      }),
      prompt: 'A dramatic coastline of black volcanic cliffs at golden hour',
      debug: false,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(result.token).toBe('jwt-live')
    expect(result.model).toBe(REACTOR_WORLD_SLUGS['visko-orbis-stable'])
    expect(result.prompt).toBe(
      'A dramatic coastline of black volcanic cliffs at golden hour',
    )
    expect(result.status).toBe('ready')
    expect(result.expiresAt).toBe(1_800_000_000 * 1000)
  })

  it('createReactorWorld passes the explicit key', async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse({ jwt: 'jwt-create', expires_at: 1_800_000_000 }),
    )

    await generateWorld({
      adapter: createReactorWorld('visko-orbis-dynamic', 'rk_explicit', {
        fetch: fetchImpl,
      }),
      prompt: 'storm clouds',
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
      'reactor/visko-orbis-dynamic',
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
      generateWorld({
        adapter: reactorWorld('helios', {
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

  it('throws when the token body has no jwt', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ expires_at: 1_800_000_000 }),
    )

    await expect(
      generateWorld({
        adapter: reactorWorld('visko-orbis-stable', {
          apiKey: 'rk_test',
          fetch: fetchImpl,
        }),
        prompt: 'a forest',
        debug: false,
      }),
    ).rejects.toThrow(/did not include a jwt/)
  })

  it('throws when expires_at is missing', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ jwt: 'jwt-live' }))

    await expect(
      generateWorld({
        adapter: reactorWorld('lingbot', {
          apiKey: 'rk_test',
          fetch: fetchImpl,
        }),
        prompt: 'a forest',
        debug: false,
      }),
    ).rejects.toThrow(/did not include expires_at/)
  })

  it('throws when REACTOR_API_KEY is missing', () => {
    const previous = process.env.REACTOR_API_KEY
    delete process.env.REACTOR_API_KEY
    try {
      expect(() => reactorWorld('lingbot')).toThrow(/REACTOR_API_KEY/)
    } finally {
      if (previous === undefined) {
        delete process.env.REACTOR_API_KEY
      } else {
        process.env.REACTOR_API_KEY = previous
      }
    }
  })
})
