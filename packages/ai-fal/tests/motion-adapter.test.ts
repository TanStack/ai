import { describe, expect, it } from 'vitest'
import {
  cancel3dMotionJob,
  generate3dMotion,
  get3dMotionJobStatus,
} from '@tanstack/ai'
import { fal3dMotion } from '../src/adapters/motion'
import type { StreamChunk } from '@tanstack/ai'

const QUEUE = 'https://queue.fal.run'
const FBX_URL = 'https://v3b.fal.media/files/b/orc/swing.fbx'
const JSON_URL = 'https://v3b.fal.media/files/b/orc/swing.json'

interface FakeResponse {
  status?: number
  body: unknown
  headers?: Record<string, string>
}

interface FalRequest {
  method: string
  url: string
  body: unknown
}

/**
 * A fake fal HTTP API. `routes` maps `METHOD url` to one response, or to a
 * list answered in order (the last one repeats). This is the network
 * boundary; the adapter and fal client code run for real.
 */
function fakeFal(routes: Record<string, FakeResponse | Array<FakeResponse>>) {
  const requests: Array<FalRequest> = []
  const calls = new Map<string, number>()
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const url = request.url.split('?')[0]!
    const key = `${request.method} ${url}`
    const text = await request.text()
    requests.push({
      method: request.method,
      url,
      body: text ? JSON.parse(text) : undefined,
    })
    const route = routes[key]
    if (!route) {
      return new Response(JSON.stringify({ detail: `no route ${key}` }), {
        status: 404,
      })
    }
    const index = calls.get(key) ?? 0
    calls.set(key, index + 1)
    const answer = Array.isArray(route)
      ? route[Math.min(index, route.length - 1)]!
      : route
    return new Response(JSON.stringify(answer.body), {
      status: answer.status ?? 200,
      headers: { 'content-type': 'application/json', ...answer.headers },
    })
  }
  return { fetch, requests }
}

const finishedOutput = {
  fbx_file: {
    url: FBX_URL,
    content_type: 'application/octet-stream',
    file_name: 'swing.fbx',
    file_size: 48_213,
  },
  motion_json: { url: JSON_URL },
  seed: 42,
}

function customChunks(chunks: Array<StreamChunk>) {
  return chunks.flatMap((c) =>
    c.type === 'CUSTOM' ? [{ name: c.name, value: c.value }] : [],
  )
}

describe('fal3dMotion', () => {
  it('streams a Hunyuan Motion job from submit to FBX asset', async () => {
    const app = `${QUEUE}/fal-ai/hunyuan-motion`
    const fal = fakeFal({
      [`POST ${app}`]: { body: { request_id: 'req-1' } },
      [`GET ${app}/requests/req-1/status`]: [
        { body: { status: 'IN_QUEUE', queue_position: 1 } },
        { body: { status: 'IN_PROGRESS' } },
        { body: { status: 'COMPLETED' } },
      ],
      [`GET ${app}/requests/req-1`]: {
        body: finishedOutput,
        headers: {
          'x-fal-request-id': 'req-1',
          'x-fal-billable-units': '1',
        },
      },
    })

    const chunks: Array<StreamChunk> = []
    for await (const c of generate3dMotion({
      adapter: fal3dMotion('fal-ai/hunyuan-motion', {
        apiKey: 'fal-test',
        fetch: fal.fetch,
      }),
      threadId: 'orc',
      prompt: 'A heavy two-handed overhead axe swing',
      duration: 3,
      modelOptions: { seed: 42, guidance_scale: 6 },
      stream: true,
      pollingInterval: 0,
    })) {
      chunks.push(c)
    }

    expect(fal.requests[0]).toEqual({
      method: 'POST',
      url: app,
      body: {
        seed: 42,
        guidance_scale: 6,
        prompt: 'A heavy two-handed overhead axe swing',
        duration: 3,
      },
    })
    expect(customChunks(chunks)).toEqual([
      {
        name: 'motion3d:job:created',
        value: { jobId: 'req-1', model: 'fal-ai/hunyuan-motion' },
      },
      {
        name: 'motion3d:status',
        value: { jobId: 'req-1', status: 'pending', queuePosition: 1 },
      },
      {
        name: 'motion3d:status',
        value: { jobId: 'req-1', status: 'processing' },
      },
      {
        name: 'motion3d:status',
        value: { jobId: 'req-1', status: 'completed' },
      },
      {
        name: 'generation:result',
        value: {
          jobId: 'req-1',
          model: 'fal-ai/hunyuan-motion',
          assets: [
            {
              url: FBX_URL,
              format: 'fbx',
              contentType: 'application/octet-stream',
              fileName: 'swing.fbx',
              fileSize: 48_213,
            },
            { url: JSON_URL, format: 'json' },
          ],
          seed: 42,
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            billed: { quantity: 1, unit: 'units' },
          },
        },
      },
    ])
    expect(chunks.at(-1)?.type).toBe('RUN_FINISHED')
  })

  it('polls the fast model on the shared owner/app queue path', async () => {
    const fal = fakeFal({
      [`GET ${QUEUE}/fal-ai/hunyuan-motion/requests/req-2/status`]: {
        body: { status: 'IN_QUEUE', queue_position: 4 },
      },
    })

    const status = await get3dMotionJobStatus({
      adapter: fal3dMotion('fal-ai/hunyuan-motion/fast', {
        apiKey: 'fal-test',
        fetch: fal.fetch,
      }),
      jobId: 'req-2',
    })

    expect(status).toEqual({
      jobId: 'req-2',
      status: 'pending',
      queuePosition: 4,
    })
  })

  it('reports a failed job when fal completes the request with an error', async () => {
    const fal = fakeFal({
      [`GET ${QUEUE}/fal-ai/hunyuan-motion/requests/req-3/status`]: {
        body: { status: 'COMPLETED', error: 'Runner crashed' },
      },
    })

    const status = await get3dMotionJobStatus({
      adapter: fal3dMotion('fal-ai/hunyuan-motion', {
        apiKey: 'fal-test',
        fetch: fal.fetch,
      }),
      jobId: 'req-3',
    })

    expect(status).toEqual({
      jobId: 'req-3',
      status: 'failed',
      error: 'Runner crashed',
    })
  })

  it('turns a 422 on the result fetch into a failed status with field errors', async () => {
    const app = `${QUEUE}/fal-ai/hunyuan-motion`
    const fal = fakeFal({
      [`GET ${app}/requests/req-4/status`]: { body: { status: 'COMPLETED' } },
      [`GET ${app}/requests/req-4`]: {
        status: 422,
        body: {
          detail: [
            {
              loc: ['body', 'duration'],
              msg: 'must be at most 12',
              type: 'value_error',
            },
          ],
        },
      },
    })

    const status = await get3dMotionJobStatus({
      adapter: fal3dMotion('fal-ai/hunyuan-motion', {
        apiKey: 'fal-test',
        fetch: fal.fetch,
      }),
      jobId: 'req-4',
    })

    expect(status).toEqual({
      jobId: 'req-4',
      status: 'failed',
      error: 'Motion generation failed: body.duration: must be at most 12',
    })
  })

  it('sends a remote cancel with a PUT to the request cancel URL', async () => {
    const cancelUrl = `${QUEUE}/fal-ai/hunyuan-motion/requests/req-5/cancel`
    const fal = fakeFal({
      [`PUT ${cancelUrl}`]: { body: { status: 'OK' } },
    })

    await cancel3dMotionJob({
      adapter: fal3dMotion('fal-ai/hunyuan-motion', {
        apiKey: 'fal-test',
        fetch: fal.fetch,
      }),
      jobId: 'req-5',
    })

    expect(fal.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      `PUT ${cancelUrl}`,
    ])
  })

  it('rejects a cancel that fal refuses because the request already completed', async () => {
    const fal = fakeFal({
      [`PUT ${QUEUE}/fal-ai/hunyuan-motion/requests/req-6/cancel`]: {
        status: 400,
        body: { status: 'ALREADY_COMPLETED' },
      },
    })

    await expect(
      cancel3dMotionJob({
        adapter: fal3dMotion('fal-ai/hunyuan-motion', {
          apiKey: 'fal-test',
          fetch: fal.fetch,
        }),
        jobId: 'req-6',
      }),
    ).rejects.toMatchObject({ status: 400 })
  })
})
