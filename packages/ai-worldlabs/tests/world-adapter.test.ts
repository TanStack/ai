import { describe, expect, it, vi } from 'vitest'
import { generateWorld } from '@tanstack/ai'
import {
  createWorldLabsWorld,
  isWorldLabsWorldModel,
  worldlabsWorld,
} from '../src'
import type { WorldLabsWorldProviderOptions } from '../src'

const OPERATION_ID = 'op-1'
const WORLD_ID = 'world-1'
const MARBLE_URL = `https://marble.worldlabs.ai/world/${WORLD_ID}`

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

async function requestJson(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<unknown> {
  if (input instanceof Request) {
    return JSON.parse(await input.clone().text())
  }
  return JSON.parse(String(init?.body))
}

function worldPayload() {
  return {
    world_id: WORLD_ID,
    display_name: 'Mystical Forest',
    world_marble_url: MARBLE_URL,
    model: 'marble-1.1',
    assets: {
      caption: 'A fantastical forest',
      thumbnail_url: 'https://example.com/thumb.jpg',
      splats: {
        spz_urls: { '100k': 'https://example.com/100k.spz' },
        semantics_metadata: {
          metric_scale_factor: 1.23,
          ground_plane_offset: 0.42,
        },
      },
      mesh: { collider_mesh_url: 'https://example.com/collider.glb' },
      imagery: { pano_url: 'https://example.com/pano.jpg' },
    },
  }
}

function generateMarble(
  fetchImpl: typeof fetch,
  options: {
    prompt?: string
    modelOptions?: WorldLabsWorldProviderOptions
    abortSignal?: AbortSignal
  } = {},
) {
  return generateWorld({
    adapter: worldlabsWorld('marble-1.1', {
      apiKey: 'wlt_test',
      fetch: fetchImpl,
    }),
    prompt: options.prompt ?? 'a forest',
    ...(options.modelOptions ? { modelOptions: options.modelOptions } : {}),
    ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
    debug: false,
  })
}

function completedWorld(extra?: Record<string, unknown>) {
  return jsonResponse({
    operation_id: OPERATION_ID,
    done: true,
    response: worldPayload(),
    ...extra,
  })
}

function expectWorldPrompt(expected: unknown) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = (await requestJson(input, init)) as { world_prompt: unknown }
    expect(body.world_prompt).toEqual(expected)
    return completedWorld()
  })
}

describe('World Labs world adapter', () => {
  it('narrows known Marble model ids', () => {
    expect(isWorldLabsWorldModel('marble-1.1')).toBe(true)
    expect(isWorldLabsWorldModel('not-a-model')).toBe(false)
  })

  it('polls until the world is ready', async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input)
        if (url.endsWith('/marble/v1/worlds:generate')) {
          const method = input instanceof Request ? input.method : init?.method
          expect(method).toBe('POST')
          const body = (await requestJson(input, init)) as {
            model: string
            world_prompt: { type: string; text_prompt: string }
          }
          expect(body.model).toBe('marble-1.1')
          expect(body.world_prompt).toEqual({
            type: 'text',
            text_prompt: 'A mystical forest with glowing mushrooms',
          })
          return jsonResponse({
            operation_id: OPERATION_ID,
            done: false,
            metadata: { world_id: WORLD_ID },
          })
        }
        if (url.endsWith(`/marble/v1/operations/${OPERATION_ID}`)) {
          return jsonResponse({
            operation_id: OPERATION_ID,
            done: true,
            response: worldPayload(),
          })
        }
        throw new Error(`unexpected url ${url}`)
      },
    )

    const result = await generateMarble(fetchImpl, {
      prompt: 'A mystical forest with glowing mushrooms',
      modelOptions: { pollIntervalMs: 1 },
    })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result.status).toBe('ready')
    expect(result.url).toBe(MARBLE_URL)
    expect(result.worldId).toBe(WORLD_ID)
    expect(result.operationId).toBe(OPERATION_ID)
    expect(result.model).toBe('marble-1.1')
    expect(result.assets?.caption).toBe('A fantastical forest')
    expect(result.assets?.thumbnailUrl).toBe('https://example.com/thumb.jpg')
    expect(result.assets?.splats?.spzUrls).toEqual({
      '100k': 'https://example.com/100k.spz',
    })
    expect(result.assets?.splats?.metricScaleFactor).toBe(1.23)
    expect(result.assets?.splats?.groundPlaneOffset).toBe(0.42)
    expect(result.assets?.mesh?.colliderMeshUrl).toBe(
      'https://example.com/collider.glb',
    )
    expect(result.assets?.imagery?.panoUrl).toBe('https://example.com/pano.jpg')
    expect(result.token).toBeUndefined()
  })

  it('returns waiting when wait is false', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(requestUrl(input).endsWith('/marble/v1/worlds:generate')).toBe(
        true,
      )
      return jsonResponse({
        operation_id: OPERATION_ID,
        done: false,
        metadata: { world_id: WORLD_ID },
      })
    })

    const result = await generateWorld({
      adapter: createWorldLabsWorld('marble-1.1-plus', 'wlt_explicit', {
        fetch: fetchImpl,
      }),
      prompt: 'A coastal castle',
      modelOptions: { wait: false },
      debug: false,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('waiting')
    expect(result.operationId).toBe(OPERATION_ID)
    expect(result.worldId).toBe(WORLD_ID)
    expect(result.url).toBeUndefined()
  })

  it('sends an image prompt when modelOptions.image is set', async () => {
    await generateMarble(
      expectWorldPrompt({
        type: 'image',
        image_prompt: {
          source: 'uri',
          uri: 'https://example.com/scene.jpg',
        },
        text_prompt: 'A beautiful landscape',
        is_pano: 'auto',
      }),
      {
        prompt: 'A beautiful landscape',
        modelOptions: {
          image: { uri: 'https://example.com/scene.jpg' },
          isPano: 'auto',
        },
      },
    )
  })

  it('throws when generate returns an error status', async () => {
    await expect(
      generateWorld({
        adapter: worldlabsWorld('marble-1.0', {
          apiKey: 'wlt_test',
          fetch: vi.fn(async () => jsonResponse({ detail: 'no credits' }, 402)),
        }),
        prompt: 'a forest',
        debug: false,
      }),
    ).rejects.toThrow(/World Labs generate request failed \(402/)
  })

  it('throws when the completed operation has an error', async () => {
    await expect(
      generateMarble(
        vi.fn(async () =>
          jsonResponse({
            operation_id: OPERATION_ID,
            done: true,
            error: { code: 500, message: 'generation exploded' },
          }),
        ),
      ),
    ).rejects.toThrow(/generation exploded/)
  })

  it('throws when image and video are both set', async () => {
    await expect(
      generateMarble(vi.fn(), {
        modelOptions: {
          image: { uri: 'https://example.com/a.jpg' },
          video: { uri: 'https://example.com/a.mp4' },
        },
      }),
    ).rejects.toThrow(/only one of/)
  })

  it('returns ready when wait is false but generate already finished', async () => {
    const fetchImpl = vi.fn(async () => completedWorld())
    const result = await generateMarble(fetchImpl, {
      modelOptions: { wait: false },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('ready')
    expect(result.url).toBe(MARBLE_URL)
  })

  it('throws when wait is false and generate already failed', async () => {
    await expect(
      generateMarble(
        vi.fn(async () =>
          jsonResponse({
            operation_id: OPERATION_ID,
            done: true,
            error: { message: 'generation exploded' },
          }),
        ),
        { modelOptions: { wait: false } },
      ),
    ).rejects.toThrow(/generation exploded/)
  })

  it('throws when a poll request fails', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (requestUrl(input).endsWith('/marble/v1/worlds:generate')) {
        return jsonResponse({ operation_id: OPERATION_ID, done: false })
      }
      return jsonResponse({ detail: 'ops down' }, 500)
    })
    await expect(
      generateMarble(fetchImpl, { modelOptions: { pollIntervalMs: 1 } }),
    ).rejects.toThrow(/operation poll failed \(500/)
  })

  it('throws when a poll payload omits done', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (requestUrl(input).endsWith('/marble/v1/worlds:generate')) {
        return jsonResponse({ operation_id: OPERATION_ID, done: false })
      }
      return jsonResponse({ operation_id: OPERATION_ID })
    })
    await expect(
      generateMarble(fetchImpl, { modelOptions: { pollIntervalMs: 1 } }),
    ).rejects.toThrow(/invalid poll payload/)
  })

  it('throws when generate omits operation_id', async () => {
    await expect(
      generateMarble(vi.fn(async () => jsonResponse({ done: false }))),
    ).rejects.toThrow(/missing operation_id/)
  })

  it('throws when a completed operation has no world', async () => {
    await expect(
      generateMarble(
        vi.fn(async () =>
          jsonResponse({
            operation_id: OPERATION_ID,
            done: true,
            response: { world_id: '', world_marble_url: '' },
          }),
        ),
      ),
    ).rejects.toThrow(/completed without a world/)
  })

  it('throws when the operation error message is blank', async () => {
    await expect(
      generateMarble(
        vi.fn(async () =>
          jsonResponse({
            operation_id: OPERATION_ID,
            done: true,
            error: { code: 500, message: '' },
          }),
        ),
      ),
    ).rejects.toThrow(/World Labs operation failed \(code 500\)/)
  })

  it('sends a dataBase64 image prompt', async () => {
    await generateMarble(
      expectWorldPrompt({
        type: 'image',
        image_prompt: {
          source: 'data_base64',
          data_base64: 'abcd',
          extension: 'jpg',
        },
        text_prompt: 'A room',
      }),
      {
        prompt: 'A room',
        modelOptions: { image: { dataBase64: 'abcd', extension: 'jpg' } },
      },
    )
  })

  it('sends a multi-image prompt with azimuth', async () => {
    await generateMarble(
      expectWorldPrompt({
        type: 'multi-image',
        multi_image_prompt: [
          { content: { source: 'data_base64', data_base64: 'one' } },
          {
            content: { source: 'uri', uri: 'https://example.com/two.jpg' },
            azimuth: 90,
          },
        ],
        text_prompt: 'A courtyard',
      }),
      {
        prompt: 'A courtyard',
        modelOptions: {
          images: [
            { dataBase64: 'one' },
            { uri: 'https://example.com/two.jpg', azimuth: 90 },
          ],
        },
      },
    )
  })

  it('sends a video prompt', async () => {
    await generateMarble(
      expectWorldPrompt({
        type: 'video',
        video_prompt: {
          source: 'uri',
          uri: 'https://example.com/a.mp4',
        },
        text_prompt: 'A flythrough',
      }),
      {
        prompt: 'A flythrough',
        modelOptions: { video: { uri: 'https://example.com/a.mp4' } },
      },
    )
  })

  it('throws when a media ref has no source', async () => {
    await expect(
      generateMarble(vi.fn(), { modelOptions: { image: {} } }),
    ).rejects.toThrow(/exactly one of/)
  })

  it('aborts while waiting to poll', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input)
      if (url.endsWith('/marble/v1/worlds:generate')) {
        queueMicrotask(() => controller.abort())
        return jsonResponse({ operation_id: OPERATION_ID, done: false })
      }
      throw new Error(`unexpected url ${url}`)
    })
    await expect(
      generateMarble(fetchImpl, {
        modelOptions: { pollIntervalMs: 50 },
        abortSignal: controller.signal,
      }),
    ).rejects.toThrow(/aborted/)
    expect(
      fetchImpl.mock.calls.some((call) =>
        requestUrl(call[0] as RequestInfo | URL).includes('/operations/'),
      ),
    ).toBe(false)
  })

  it('sends WLT-Api-Key on generate', async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers =
          input instanceof Request ? input.headers : new Headers(init?.headers)
        expect(headers.get('WLT-Api-Key') ?? headers.get('wlt-api-key')).toBe(
          'wlt_test',
        )
        return completedWorld()
      },
    )
    await generateMarble(fetchImpl)
  })

  it('maps expires_at to milliseconds', async () => {
    const result = await generateMarble(
      vi.fn(async () =>
        completedWorld({ expires_at: '2026-01-02T03:04:05.000Z' }),
      ),
    )
    expect(result.expiresAt).toBe(Date.parse('2026-01-02T03:04:05.000Z'))
  })

  it('throws when WORLDLABS_API_KEY is missing', () => {
    const previous = process.env.WORLDLABS_API_KEY
    delete process.env.WORLDLABS_API_KEY
    try {
      expect(() => worldlabsWorld('marble-1.1')).toThrow(/WORLDLABS_API_KEY/)
    } finally {
      if (previous === undefined) {
        delete process.env.WORLDLABS_API_KEY
      } else {
        process.env.WORLDLABS_API_KEY = previous
      }
    }
  })
})
