import { describe, expect, it } from 'vitest'
import { cancelMotionJob, generateMotion } from '@tanstack/ai'
import { meshyMotion } from '../src/adapters/motion'
import type { MeshyTask } from '../src/client'

const MOTION_URL = 'https://api.meshy.ai/openapi/v1/text-to-motion'
const CLIP_URL =
  'https://assets.meshy.ai/u1/tasks/task-1/output/clip.fbx?Expires=123'

interface SeenRequest {
  method: string
  url: string
  body: unknown
}

/**
 * A fake Meshy API. It answers with the given responses, in order, and
 * records each request. This is the network boundary: the adapter and the
 * Meshy client run for real.
 */
function fakeMeshy(...responses: Array<Response>) {
  const requests: Array<SeenRequest> = []
  const queue = [...responses]
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const text = await request.text()
    requests.push({
      method: request.method,
      url: request.url,
      body: text ? JSON.parse(text) : undefined,
    })
    const next = queue.shift()
    if (!next) throw new Error('fakeMeshy: no response left')
    return next
  }
  return { fetch, requests }
}

function motionTask(overrides?: Partial<MeshyTask>): MeshyTask {
  return {
    id: 'task-1',
    type: 'text-to-motion',
    status: 'IN_PROGRESS',
    progress: 50,
    task_error: null,
    result: { motion_url: '', motion_format: '', duration_ms: 0, mode: '' },
    ...overrides,
  }
}

const succeededTask = motionTask({
  status: 'SUCCEEDED',
  progress: 100,
  result: {
    motion_url: CLIP_URL,
    motion_format: 'fbx',
    duration_ms: 3000,
    mode: 'prime',
  },
})

function adapterWith(...responses: Array<Response>) {
  const meshy = fakeMeshy(...responses)
  const adapter = meshyMotion('prime', { apiKey: 'key', fetch: meshy.fetch })
  return { adapter, requests: meshy.requests }
}

describe('meshyMotion', () => {
  it('sends prompt, mode and duration', async () => {
    const { adapter, requests } = adapterWith(
      Response.json({ result: 'task-1' }, { status: 202 }),
    )

    const job = await generateMotion({
      adapter,
      prompt: 'a person jumps over a fence',
      duration: 4,
      threadId: 'thread-1',
    })

    expect(job).toEqual({ jobId: 'task-1', model: 'prime' })
    expect(requests).toEqual([
      {
        method: 'POST',
        url: MOTION_URL,
        body: {
          prompt: 'a person jumps over a fence',
          mode: 'prime',
          duration: 4,
        },
      },
    ])
  })

  it('throws before any request when duration is missing', async () => {
    const { adapter, requests } = adapterWith()

    await expect(
      generateMotion({
        adapter,
        prompt: 'a person waves',
        threadId: 'thread-1',
      }),
    ).rejects.toThrow(
      'Meshy text to motion needs a duration: 2 to 10 seconds, in steps of 0.5.',
    )
    expect(requests).toEqual([])
  })

  it('maps statuses', async () => {
    const { adapter, requests } = adapterWith(
      Response.json(motionTask({ status: 'IN_PROGRESS', progress: 40 })),
      Response.json(
        motionTask({
          status: 'FAILED',
          progress: 0,
          task_error: { message: 'Prompt was flagged' },
        }),
      ),
    )

    expect(await adapter.getMotionStatus('task-1')).toEqual({
      jobId: 'task-1',
      status: 'processing',
      progress: 40,
    })
    expect(await adapter.getMotionStatus('task-1')).toEqual({
      jobId: 'task-1',
      status: 'failed',
      progress: 0,
      error: 'Prompt was flagged',
    })
    expect(requests.map(({ method, url }) => `${method} ${url}`)).toEqual([
      `GET ${MOTION_URL}/task-1`,
      `GET ${MOTION_URL}/task-1`,
    ])
  })

  describe('getMotion', () => {
    it('getMotion returns the motion asset', async () => {
      const { adapter } = adapterWith(Response.json(succeededTask))

      expect(await adapter.getMotion('task-1')).toEqual({
        jobId: 'task-1',
        model: 'prime',
        assets: [
          { url: CLIP_URL, format: 'fbx', fileName: 'meshy-task-1.fbx' },
        ],
      })
    })

    it('throws the task_error message for a FAILED task', async () => {
      const { adapter } = adapterWith(
        Response.json(
          motionTask({
            status: 'FAILED',
            task_error: { message: 'Prompt was flagged' },
          }),
        ),
      )

      await expect(adapter.getMotion('task-1')).rejects.toThrow(
        'Prompt was flagged',
      )
    })

    it('throws when a SUCCEEDED task has no motion_url', async () => {
      const { adapter } = adapterWith(
        Response.json(motionTask({ status: 'SUCCEEDED', progress: 100 })),
      )

      await expect(adapter.getMotion('task-1')).rejects.toThrow(
        'Meshy task task-1 succeeded but has no motion_url',
      )
    })
  })

  it('cancel throws a clear error on 409', async () => {
    const { adapter, requests } = adapterWith(
      Response.json(
        { message: 'Task is IN_PROGRESS and cannot be deleted.' },
        { status: 409 },
      ),
    )

    await expect(cancelMotionJob({ adapter, jobId: 'task-1' })).rejects.toThrow(
      'Meshy task task-1 is already running and cannot be canceled',
    )
    expect(requests.map(({ method, url }) => `${method} ${url}`)).toEqual([
      `DELETE ${MOTION_URL}/task-1`,
    ])
  })
})
