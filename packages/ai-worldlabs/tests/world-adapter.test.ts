import { describe, expect, it, vi } from 'vitest'
import { generateWorld } from '@tanstack/ai'
import {
  createWorldLabsWorld,
  isWorldLabsWorldModel,
  worldlabsWorld,
} from '../src'

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

    const result = await generateWorld({
      adapter: worldlabsWorld('marble-1.1', {
        apiKey: 'wlt_test',
        fetch: fetchImpl,
      }),
      prompt: 'A mystical forest with glowing mushrooms',
      modelOptions: { pollIntervalMs: 1 },
      debug: false,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result.status).toBe('ready')
    expect(result.url).toBe(MARBLE_URL)
    expect(result.worldId).toBe(WORLD_ID)
    expect(result.operationId).toBe(OPERATION_ID)
    expect(result.model).toBe('marble-1.1')
    expect(result.assets?.caption).toBe('A fantastical forest')
    expect(result.assets?.splats?.metricScaleFactor).toBe(1.23)
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
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const body = (await requestJson(input, init)) as {
          world_prompt: unknown
        }
        expect(body.world_prompt).toEqual({
          type: 'image',
          image_prompt: {
            source: 'uri',
            uri: 'https://example.com/scene.jpg',
          },
          text_prompt: 'A beautiful landscape',
          is_pano: 'auto',
        })
        return jsonResponse({
          operation_id: OPERATION_ID,
          done: true,
          response: worldPayload(),
        })
      },
    )

    await generateWorld({
      adapter: worldlabsWorld('marble-1.1', {
        apiKey: 'wlt_test',
        fetch: fetchImpl,
      }),
      prompt: 'A beautiful landscape',
      modelOptions: {
        image: { uri: 'https://example.com/scene.jpg' },
        isPano: 'auto',
      },
      debug: false,
    })
  })

  it('throws when generate returns an error status', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ detail: 'no credits' }, 402),
    )

    await expect(
      generateWorld({
        adapter: worldlabsWorld('marble-1.0', {
          apiKey: 'wlt_test',
          fetch: fetchImpl,
        }),
        prompt: 'a forest',
        debug: false,
      }),
    ).rejects.toThrow(/World Labs generate request failed \(402/)
  })

  it('throws when the completed operation has an error', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        operation_id: OPERATION_ID,
        done: true,
        error: { code: 500, message: 'generation exploded' },
      }),
    )

    await expect(
      generateWorld({
        adapter: worldlabsWorld('marble-1.1', {
          apiKey: 'wlt_test',
          fetch: fetchImpl,
        }),
        prompt: 'a forest',
        debug: false,
      }),
    ).rejects.toThrow(/generation exploded/)
  })

  it('throws when image and video are both set', async () => {
    await expect(
      generateWorld({
        adapter: worldlabsWorld('marble-1.1', {
          apiKey: 'wlt_test',
          fetch: vi.fn(),
        }),
        prompt: 'a forest',
        modelOptions: {
          image: { uri: 'https://example.com/a.jpg' },
          video: { uri: 'https://example.com/a.mp4' },
        },
        debug: false,
      }),
    ).rejects.toThrow(/only one of/)
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
