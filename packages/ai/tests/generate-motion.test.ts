import { describe, expect, it, vi } from 'vitest'
import {
  cancelMotionJob,
  generateMotion,
  getMotionJobStatus,
} from '../src/index'
import { collectChunks } from './test-utils'
import type { MotionAdapter } from '../src/activities/generateMotion/adapter'
import type { GenerationMiddleware } from '../src/activities/middleware/types'
import type {
  MotionGenerationResult,
  MotionStatusResult,
  StreamChunk,
} from '../src/types'

const FBX_URL = 'https://cdn.example.com/orc-swing.fbx'

const finishedMotion: MotionGenerationResult = {
  jobId: 'job-1',
  model: 'motion-model',
  assets: [{ url: FBX_URL, format: 'fbx' }],
  seed: 42,
}

/**
 * A provider stand-in. `statuses` are returned one per poll, the last one
 * repeating. This is the provider boundary, not code under test.
 */
function fakeMotionAdapter(options: {
  statuses: Array<Omit<MotionStatusResult, 'jobId'>>
  getMotion?: MotionAdapter['getMotion']
  cancelMotionJob?: MotionAdapter['cancelMotionJob']
}): MotionAdapter {
  let poll = 0
  return {
    kind: 'motion',
    name: 'fake',
    model: 'motion-model',
    '~types': { providerOptions: {} },
    createMotionJob: async () => ({ jobId: 'job-1', model: 'motion-model' }),
    getMotionStatus: async (jobId) => {
      const status =
        options.statuses[Math.min(poll, options.statuses.length - 1)]!
      poll += 1
      return { jobId, ...status }
    },
    getMotion: options.getMotion ?? (async () => finishedMotion),
    ...(options.cancelMotionJob
      ? { cancelMotionJob: options.cancelMotionJob }
      : {}),
  }
}

function customChunks(chunks: Array<StreamChunk>) {
  return chunks.flatMap((c) =>
    c.type === 'CUSTOM' ? [{ name: c.name, value: c.value }] : [],
  )
}

function recordingMiddleware() {
  const calls: Array<{ hook: string; runId: string | undefined }> = []
  const middleware: GenerationMiddleware = {
    onStart: (ctx) => void calls.push({ hook: 'start', runId: ctx.runId }),
    onFinish: (ctx) => void calls.push({ hook: 'finish', runId: ctx.runId }),
    onError: (ctx) => void calls.push({ hook: 'error', runId: ctx.runId }),
    onAbort: (ctx) => void calls.push({ hook: 'abort', runId: ctx.runId }),
  }
  return { calls, middleware }
}

describe('generateMotion stream', () => {
  it('streams job, statuses, and the finished assets', async () => {
    const adapter = fakeMotionAdapter({
      statuses: [
        { status: 'pending', queuePosition: 2 },
        { status: 'processing', progress: 50 },
        { status: 'completed' },
      ],
    })

    const chunks = await collectChunks(
      generateMotion({
        adapter,
        threadId: 'orc',
        prompt: 'overhead axe swing',
        stream: true,
        pollingInterval: 0,
      }),
    )

    expect(chunks[0]?.type).toBe('RUN_STARTED')
    expect(chunks.at(-1)?.type).toBe('RUN_FINISHED')
    expect(customChunks(chunks)).toEqual([
      {
        name: 'motion:job:created',
        value: { jobId: 'job-1', model: 'motion-model' },
      },
      {
        name: 'motion:status',
        value: { jobId: 'job-1', status: 'pending', queuePosition: 2 },
      },
      {
        name: 'motion:status',
        value: { jobId: 'job-1', status: 'processing', progress: 50 },
      },
      // Only the poll with a real provider number becomes progress.
      {
        name: 'generation:progress',
        value: { progress: 50, message: 'processing' },
      },
      { name: 'motion:status', value: { jobId: 'job-1', status: 'completed' } },
      { name: 'generation:result', value: finishedMotion },
    ])
  })

  it('ends with RUN_ERROR carrying the provider error when the job fails', async () => {
    const adapter = fakeMotionAdapter({
      statuses: [{ status: 'failed', error: 'prompt rejected' }],
    })

    const chunks = await collectChunks(
      generateMotion({
        adapter,
        threadId: 'orc',
        prompt: 'overhead axe swing',
        stream: true,
        pollingInterval: 0,
      }),
    )

    const last = chunks.at(-1)
    expect(last?.type).toBe('RUN_ERROR')
    expect(last?.type === 'RUN_ERROR' && last.message).toBe('prompt rejected')
  })

  it('stops observing on abort and leaves the provider job running', async () => {
    const cancel = vi.fn(async () => {})
    const adapter = fakeMotionAdapter({
      statuses: [{ status: 'processing' }],
      cancelMotionJob: cancel,
    })
    const controller = new AbortController()
    const { calls, middleware } = recordingMiddleware()

    const chunks: Array<StreamChunk> = []
    for await (const c of generateMotion({
      adapter,
      threadId: 'orc',
      prompt: 'overhead axe swing',
      stream: true,
      pollingInterval: 0,
      middleware: [middleware],
      abortSignal: controller.signal,
    })) {
      chunks.push(c)
      if (c.type === 'CUSTOM' && c.name === 'motion:status') controller.abort()
    }

    expect(chunks.at(-1)?.type).toBe('RUN_ERROR')
    expect(calls.map((c) => c.hook)).toEqual(['start', 'abort'])
    expect(cancel).not.toHaveBeenCalled()
  })
})

describe('generateMotion submit and getMotionJobStatus', () => {
  it('returns the job id, and a later poll closes the same middleware run', async () => {
    const adapter = fakeMotionAdapter({ statuses: [{ status: 'completed' }] })
    const { calls, middleware } = recordingMiddleware()

    const job = await generateMotion({
      adapter,
      threadId: 'orc',
      prompt: 'overhead axe swing',
      middleware: [middleware],
    })
    const status = await getMotionJobStatus({
      adapter,
      jobId: job.jobId,
      threadId: 'orc',
      middleware: [middleware],
    })

    expect(job).toEqual({ jobId: 'job-1', model: 'motion-model' })
    expect(status).toEqual({
      jobId: 'job-1',
      status: 'completed',
      motion: finishedMotion,
    })
    expect(calls).toEqual([
      { hook: 'start', runId: 'motion:fake:job-1' },
      { hook: 'start', runId: 'motion:fake:job-1' },
      { hook: 'finish', runId: 'motion:fake:job-1' },
    ])
  })

  it('returns a pending status with no motion and fires no middleware', async () => {
    const adapter = fakeMotionAdapter({
      statuses: [{ status: 'pending', queuePosition: 3 }],
    })
    const { calls, middleware } = recordingMiddleware()

    const status = await getMotionJobStatus({
      adapter,
      jobId: 'job-1',
      middleware: [middleware],
    })

    expect(status).toEqual({
      jobId: 'job-1',
      status: 'pending',
      queuePosition: 3,
    })
    expect(calls).toEqual([])
  })

  it('reports failed when the job completed but its result cannot be read', async () => {
    const adapter = fakeMotionAdapter({
      statuses: [{ status: 'completed' }],
      getMotion: async () => {
        throw new Error('result expired')
      },
    })

    const status = await getMotionJobStatus({ adapter, jobId: 'job-1' })

    expect(status).toEqual({
      jobId: 'job-1',
      status: 'failed',
      error: 'result expired',
    })
  })
})

describe('cancelMotionJob', () => {
  it('asks the provider to cancel the job', async () => {
    const cancel = vi.fn(async () => {})
    const adapter = fakeMotionAdapter({
      statuses: [{ status: 'processing' }],
      cancelMotionJob: cancel,
    })

    await cancelMotionJob({ adapter, jobId: 'job-9' })

    expect(cancel).toHaveBeenCalledWith('job-9', undefined)
  })

  it('throws when the provider has no cancel API', async () => {
    const adapter = fakeMotionAdapter({ statuses: [{ status: 'processing' }] })

    await expect(cancelMotionJob({ adapter, jobId: 'job-9' })).rejects.toThrow(
      'The fake motion adapter cannot cancel jobs: the provider has no cancel API.',
    )
  })
})
