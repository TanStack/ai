import { describe, expect, it, vi } from 'vitest'
import { generateLiveVideo } from '@tanstack/ai'
import {
  allowedFalLiveVideoProxyTarget,
  createFalLiveVideo,
  FAL_LIVE_VIDEO_APP,
  falLiveVideo,
  isFalLiveVideoModel,
} from '../src'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('fal live adapter', () => {
  it('narrows the Director model id', () => {
    expect(isFalLiveVideoModel('minimax/h3-max/director')).toBe(true)
    expect(isFalLiveVideoModel('fal-ai/kling-video/v3/pro/text-to-video')).toBe(
      false,
    )
    expect(FAL_LIVE_VIDEO_APP['minimax/h3-max/director']).toBe(
      'fal-ai/minimax-h3-max-director',
    )
  })

  it('allows only Director WMA and ICE fallback URLs through the live proxy', () => {
    const allowed = [
      'https://wma.fal.run/ice',
      'https://wma.fal.run/session',
      'https://wma.fal.run/session/heartbeat',
      'https://wma.fal.run/session/',
      'https://fal.run/fal-ai/minimax-h3-max-director/ice',
    ]
    for (const raw of allowed) {
      expect(allowedFalLiveVideoProxyTarget(raw)?.href).toBe(new URL(raw).href)
    }

    const rejected = [
      'https://queue.fal.run/fal-ai/flux/dev',
      'https://fal.run/fal-ai/flux/dev',
      'https://fal.run/fal-ai/minimax-h3-max-director',
      'https://wma.fal.run/tokens',
      'https://wma.fal.run/session?next=/ice',
      'http://wma.fal.run/session',
      'https://evil.example/steal',
      'https://user:pass@wma.fal.run/session',
      'not-a-url',
    ]
    for (const raw of rejected) {
      expect(allowedFalLiveVideoProxyTarget(raw)).toBeNull()
    }
  })

  it('mints a scoped token and returns the WMA app id as model', async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe('https://rest.fal.ai/tokens/')
        expect(init?.method).toBe('POST')
        expect(init?.headers).toMatchObject({
          Authorization: 'Key fal_test',
          'Content-Type': 'application/json',
        })
        const body = JSON.parse(String(init?.body)) as {
          allowed_apps: Array<string>
          token_expiration: number
        }
        expect(body.allowed_apps).toEqual(['fal-ai/minimax-h3-max-director'])
        expect(body.token_expiration).toBe(300)
        return jsonResponse({ token: 'jwt-fal' })
      },
    )

    const result = await generateLiveVideo({
      adapter: falLiveVideo('minimax/h3-max/director', {
        apiKey: 'fal_test',
        fetch: fetchImpl,
      }),
      prompt: 'Live shopping stream: a host holds up a gold watch',
      debug: false,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(result.token).toBe('jwt-fal')
    expect(result.model).toBe('fal-ai/minimax-h3-max-director')
    expect(result.prompt).toBe(
      'Live shopping stream: a host holds up a gold watch',
    )
    expect(result.status).toBe('ready')
    expect(result.expiresAt).toBeGreaterThan(Date.now())
  })

  it('honors tokenDuration in modelOptions', async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          token_expiration: number
        }
        expect(body.token_expiration).toBe(120)
        return jsonResponse({ token: 'jwt-short' })
      },
    )

    await generateLiveVideo({
      adapter: falLiveVideo('minimax/h3-max/director', {
        apiKey: 'fal_test',
        fetch: fetchImpl,
      }),
      prompt: 'a news desk',
      modelOptions: { tokenDuration: 120 },
      debug: false,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('createFalLiveVideo passes the explicit key', async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse({ token: 'jwt-create' }),
    )

    await generateLiveVideo({
      adapter: createFalLiveVideo('minimax/h3-max/director', 'fal_explicit', {
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
      generateLiveVideo({
        adapter: falLiveVideo('minimax/h3-max/director', {
          apiKey: 'fal_test',
          fetch: fetchImpl,
        }),
        prompt: 'a forest',
        debug: false,
      }),
    ).rejects.toThrow(
      /fal token request failed \(402 Payment Required\): no credits/,
    )
  })

  it('throws when the token body has no token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}))

    await expect(
      generateLiveVideo({
        adapter: falLiveVideo('minimax/h3-max/director', {
          apiKey: 'fal_test',
          fetch: fetchImpl,
        }),
        prompt: 'a forest',
        debug: false,
      }),
    ).rejects.toThrow(/did not include a token/)
  })

  it('throws when FAL_KEY is missing', () => {
    const previous = process.env.FAL_KEY
    delete process.env.FAL_KEY
    try {
      expect(() => falLiveVideo('minimax/h3-max/director')).toThrow(/FAL_KEY/)
    } finally {
      if (previous === undefined) {
        delete process.env.FAL_KEY
      } else {
        process.env.FAL_KEY = previous
      }
    }
  })
})
