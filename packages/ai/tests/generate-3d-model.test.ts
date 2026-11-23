import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import {
  BaseModel3dAdapter,
  generate3dModel,
  get3dModelJobStatus,
} from '../src/index'
import { collectChunks } from './test-utils'
import type {
  Model3dResult,
  Model3dStatusResult,
  StreamChunk,
} from '../src/types'

type ScriptedStatus = Omit<Model3dStatusResult, 'jobId'>

const MODEL: Model3dResult = {
  jobId: 'job-1',
  url: 'https://cdn.example.com/robot.glb',
  format: 'glb',
  files: [
    { url: 'https://cdn.example.com/robot.glb', format: 'glb', role: 'base' },
  ],
}

/**
 * A provider stand-in. Each status poll returns the next scripted status.
 * The last status repeats when the script runs out.
 */
class FakeModel3dAdapter extends BaseModel3dAdapter {
  readonly name = 'fake-3d'
  createCalls = 0
  statusCalls = 0
  cancelled: Array<string> = []

  constructor(private readonly statuses: Array<ScriptedStatus>) {
    super({}, 'fake-model')
  }

  async create3dModelJob() {
    this.createCalls += 1
    return { jobId: 'job-1', model: this.model }
  }

  async get3dModelStatus(jobId: string) {
    const index = Math.min(this.statusCalls, this.statuses.length - 1)
    this.statusCalls += 1
    return { jobId, ...this.statuses[index]! }
  }

  async get3dModel() {
    return MODEL
  }

  async cancel3dModelJob(jobId: string) {
    this.cancelled.push(jobId)
  }
}

function waitFor(
  adapter: FakeModel3dAdapter,
  extra: { timeout?: number; abortSignal?: AbortSignal } = {},
) {
  return generate3dModel({
    adapter,
    prompt: 'a small robot',
    threadId: 'thread-1',
    wait: true,
    pollInterval: 1000,
    debug: false,
    ...extra,
  })
}

function streamFrom(
  adapter: FakeModel3dAdapter,
  extra: { abortSignal?: AbortSignal } = {},
) {
  return generate3dModel({
    adapter,
    prompt: 'a small robot',
    threadId: 'thread-1',
    runId: 'run-1',
    stream: true,
    pollInterval: 1,
    debug: false,
    ...extra,
  })
}

/** The chunk type, or the event name for CUSTOM chunks. */
function chunkLabel(chunk: StreamChunk) {
  return chunk.type === 'CUSTOM' ? chunk.name : chunk.type
}

afterEach(() => {
  vi.useRealTimers()
})

describe('generate3dModel', () => {
  it('submits the job and returns its id without polling', async () => {
    const adapter = new FakeModel3dAdapter([{ status: 'completed' }])

    const job = await generate3dModel({
      adapter,
      prompt: 'a small robot',
      threadId: 'thread-1',
      debug: false,
    })

    expect(job).toEqual({ jobId: 'job-1', model: 'fake-model' })
    expect(adapter.statusCalls).toBe(0)
  })

  it('waits through pending and processing and returns the model', async () => {
    vi.useFakeTimers()
    const adapter = new FakeModel3dAdapter([
      { status: 'pending' },
      { status: 'processing', progress: 50 },
      { status: 'completed' },
    ])

    const result = waitFor(adapter)
    await vi.advanceTimersByTimeAsync(3000)

    await expect(result).resolves.toEqual(MODEL)
    expect(adapter.statusCalls).toBe(3)
  })

  it('rejects with the provider message when the job fails', async () => {
    vi.useFakeTimers()
    const adapter = new FakeModel3dAdapter([
      { status: 'processing' },
      { status: 'failed', error: 'mesh too complex' },
    ])

    const result = waitFor(adapter)
    const assertion = expect(result).rejects.toThrow('mesh too complex')
    await vi.advanceTimersByTimeAsync(2000)

    await assertion
    expect(adapter.cancelled).toEqual([])
  })

  it('cancels the job and rejects when the timeout fires', async () => {
    vi.useFakeTimers()
    const adapter = new FakeModel3dAdapter([{ status: 'processing' }])

    const result = waitFor(adapter, { timeout: 2500 })
    const assertion = expect(result).rejects.toThrow(
      'Activity timed out after 2500ms',
    )
    await vi.advanceTimersByTimeAsync(3000)

    await assertion
    expect(adapter.cancelled).toEqual(['job-1'])
  })

  it('cancels a job whose id arrives after abort during create', async () => {
    const adapter = new FakeModel3dAdapter([{ status: 'processing' }])
    let started = false
    let finishCreate!: (value: { jobId: string; model: string }) => void
    adapter.create3dModelJob = () => {
      started = true
      return new Promise((resolve) => {
        finishCreate = resolve
      })
    }
    const controller = new AbortController()
    const result = waitFor(adapter, { abortSignal: controller.signal })
    await vi.waitFor(() => {
      expect(started).toBe(true)
    })
    controller.abort(new Error('user stopped'))
    await expect(result).rejects.toThrow('user stopped')
    expect(adapter.cancelled).toEqual([])
    finishCreate({ jobId: 'job-late', model: adapter.model })
    await vi.waitFor(() => {
      expect(adapter.cancelled).toEqual(['job-late'])
    })
  })

  it('creates no job when the signal is already aborted', async () => {
    const adapter = new FakeModel3dAdapter([{ status: 'processing' }])
    const controller = new AbortController()
    controller.abort(new Error('user stopped'))

    await expect(
      waitFor(adapter, { abortSignal: controller.signal }),
    ).rejects.toThrow('user stopped')
    expect(adapter.createCalls).toBe(0)
  })

  it('cancels the job and leaves no timers when aborted during the poll sleep', async () => {
    vi.useFakeTimers()
    const adapter = new FakeModel3dAdapter([{ status: 'processing' }])
    const controller = new AbortController()

    const result = waitFor(adapter, { abortSignal: controller.signal })
    const assertion = expect(result).rejects.toThrow('user stopped')
    // Let the job be created, so the activity sleeps before the first poll.
    await vi.advanceTimersByTimeAsync(0)
    controller.abort(new Error('user stopped'))

    await assertion
    expect(adapter.statusCalls).toBe(0)
    expect(adapter.cancelled).toEqual(['job-1'])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('types stream and wait as exclusive and picks the result per mode', () => {
    const adapter = new FakeModel3dAdapter([{ status: 'completed' }])
    const base = { adapter, prompt: 'x', threadId: 't' }
    // Type-only: these calls are never run.
    const calls = () => ({
      submit: generate3dModel(base),
      wait: generate3dModel({ ...base, wait: true }),
      stream: generate3dModel({ ...base, stream: true }),
      // @ts-expect-error - stream and wait cannot both be true
      both: generate3dModel({ ...base, stream: true, wait: true }),
    })
    type Calls = ReturnType<typeof calls>
    expectTypeOf<Calls['submit']>().toEqualTypeOf<
      Promise<{ jobId: string; model: string }>
    >()
    expectTypeOf<Calls['wait']>().toEqualTypeOf<Promise<Model3dResult>>()
    expectTypeOf<Calls['stream']>().toEqualTypeOf<AsyncIterable<StreamChunk>>()
  })

  it('rejects a file source before it creates a job', async () => {
    const adapter = new FakeModel3dAdapter([{ status: 'completed' }])

    await expect(
      generate3dModel({
        adapter,
        prompt: [{ type: 'image', source: { type: 'file', value: 'file-1' } }],
        threadId: 'thread-1',
        debug: false,
      }),
    ).rejects.toThrow('fake-3d does not support provider file-handle sources')
    expect(adapter.createCalls).toBe(0)
  })

  it('streams progress per poll, then the result', async () => {
    const adapter = new FakeModel3dAdapter([
      { status: 'pending' },
      { status: 'processing', progress: 40 },
      { status: 'completed' },
    ])

    const chunks = await collectChunks(streamFrom(adapter))

    expect(chunks.map(chunkLabel)).toEqual([
      'RUN_STARTED',
      'generation:progress',
      'generation:progress',
      'generation:progress',
      'generation:result',
      'RUN_FINISHED',
    ])
    const values = chunks.flatMap((chunk) =>
      chunk.type === 'CUSTOM' ? [chunk.value] : [],
    )
    expect(values).toEqual([
      { progress: 0, message: 'pending' },
      { progress: 40, message: 'processing' },
      { progress: 100, message: 'completed' },
      MODEL,
    ])
  })

  it('ends the stream with RUN_ERROR when the job fails', async () => {
    const adapter = new FakeModel3dAdapter([
      { status: 'failed', error: 'mesh too complex' },
    ])

    const chunks = await collectChunks(streamFrom(adapter))

    expect(chunks.map(chunkLabel)).toEqual([
      'RUN_STARTED',
      'generation:progress',
      'RUN_ERROR',
    ])
    expect(chunks.at(-1)).toMatchObject({
      type: 'RUN_ERROR',
      message: 'mesh too complex',
    })
  })

  it('cancels the job when the consumer stops reading the stream', async () => {
    const adapter = new FakeModel3dAdapter([{ status: 'processing' }])

    for await (const chunk of streamFrom(adapter)) {
      if (chunk.type === 'CUSTOM') break
    }

    expect(adapter.cancelled).toEqual(['job-1'])
  })

  it('cancels the job at abort while the stream consumer is paused', async () => {
    const adapter = new FakeModel3dAdapter([{ status: 'processing' }])
    const controller = new AbortController()
    const stream = streamFrom(adapter, { abortSignal: controller.signal })[
      Symbol.asyncIterator
    ]()

    // Read up to the first status, then stop reading.
    let next = await stream.next()
    while (!next.done && next.value.type !== 'CUSTOM') {
      next = await stream.next()
    }
    controller.abort(new Error('user stopped'))

    expect(adapter.cancelled).toEqual(['job-1'])
    await stream.return?.(undefined)
    expect(adapter.cancelled).toEqual(['job-1'])
  })
})

describe('get3dModelJobStatus', () => {
  it('returns the status without a result while the job runs', async () => {
    const adapter = new FakeModel3dAdapter([
      { status: 'processing', progress: 30 },
    ])

    const status = await get3dModelJobStatus({ adapter, jobId: 'job-1' })

    expect(status).toEqual({
      jobId: 'job-1',
      status: 'processing',
      progress: 30,
    })
  })

  it('adds the finished model once the job is completed', async () => {
    const adapter = new FakeModel3dAdapter([{ status: 'completed' }])

    const status = await get3dModelJobStatus({ adapter, jobId: 'job-1' })

    expect(status).toEqual({
      jobId: 'job-1',
      status: 'completed',
      result: MODEL,
    })
  })
})
