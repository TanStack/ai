import { describe, expect, it, vi } from 'vitest'
import {
  choice,
  decide,
  deleteFile,
  embed,
  generateVideo,
  getFile,
  getVideoJobStatus,
  realtimeToken,
  rerank,
  uploadFile,
} from '../src/index'
import { BaseEmbeddingAdapter } from '../src/activities/embed/adapter'
import type { EvaluateAdapter } from '../src/activities/evaluate/adapter'
import type { RerankAdapter } from '../src/activities/rerank/adapter'
import type { FilesAdapter } from '../src/activities/files/adapter'
import type {
  GenerationAbortInfo,
  GenerationMiddleware,
  GenerationMiddlewareContext,
} from '../src/activities/middleware'
import type { RealtimeTokenAdapter } from '../src/realtime/types'
import type {
  EmbeddingOptions,
  EmbeddingResult,
  StreamChunk,
  VideoStatusResult,
} from '../src/types'

/** A promise that settles only when `signal` aborts (never, without one). */
function untilAbort<T>(signal: AbortSignal | undefined): Promise<T> {
  return new Promise<T>((_, reject) => {
    signal?.addEventListener('abort', () => reject(signal.reason), {
      once: true,
    })
  })
}

function recorder() {
  const starts: Array<GenerationMiddlewareContext> = []
  const aborts: Array<GenerationAbortInfo> = []
  const errors: Array<unknown> = []
  const middleware: GenerationMiddleware = {
    name: 'rec',
    onStart: (ctx) => {
      starts.push(ctx)
    },
    onAbort: (_ctx, info) => {
      aborts.push(info)
    },
    onError: (_ctx, info) => {
      errors.push(info.error)
    },
  }
  return { starts, aborts, errors, middleware }
}

class HangingEmbeddingAdapter extends BaseEmbeddingAdapter<'mock-embed'> {
  readonly name = 'mock'
  calls: Array<EmbeddingOptions> = []
  constructor() {
    super('mock-embed', {})
  }
  createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult> {
    this.calls.push(options)
    if (!options.abortSignal) {
      return Promise.resolve({
        id: 'e1',
        model: options.model,
        embeddings: [{ vector: [1], index: 0 }],
      })
    }
    return untilAbort(options.abortSignal)
  }
}

describe('embed() abortSignal and timeout', () => {
  it('forwards the signal to the adapter and rejects on abort', async () => {
    const adapter = new HangingEmbeddingAdapter()
    const controller = new AbortController()
    const rec = recorder()
    const pending = embed({
      adapter,
      input: 'a',
      abortSignal: controller.signal,
      middleware: [rec.middleware],
    })
    await vi.waitFor(() => expect(adapter.calls).toHaveLength(1))
    expect(adapter.calls[0]!.abortSignal?.aborted).toBe(false)
    expect(rec.starts[0]!.signal).toBe(adapter.calls[0]!.abortSignal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(adapter.calls[0]!.abortSignal?.aborted).toBe(true)
    expect(rec.aborts).toHaveLength(1)
    expect(rec.errors).toHaveLength(0)
  })

  it('rejects with a TimeoutError when timeout elapses', async () => {
    const adapter = new HangingEmbeddingAdapter()
    await expect(
      embed({ adapter, input: 'a', timeout: 5 }),
    ).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(adapter.calls[0]!.abortSignal?.aborted).toBe(true)
  })

  it('passes no signal when neither option is set', async () => {
    const adapter = new HangingEmbeddingAdapter()
    const rec = recorder()
    const result = await embed({
      adapter,
      input: 'a',
      middleware: [rec.middleware],
    })
    expect(result.embeddings).toHaveLength(1)
    expect('abortSignal' in adapter.calls[0]!).toBe(false)
    expect(rec.starts[0]!.signal).toBeUndefined()
  })
})

function videoAdapter(behavior: 'hang' | 'complete') {
  return {
    kind: 'video' as const,
    name: 'test-video',
    model: 'test-model',
    '~types': {} as any,
    availableDurations: () => ({ kind: 'none' as const }),
    snapDuration: () => undefined,
    createVideoJob: vi.fn(async () => ({
      jobId: 'job-1',
      model: 'test-model',
    })),
    getVideoStatus: vi.fn(
      (
        _jobId: string,
        options?: { abortSignal?: AbortSignal },
      ): Promise<VideoStatusResult> =>
        behavior === 'hang'
          ? untilAbort(options?.abortSignal)
          : Promise.resolve({ jobId: 'job-1', status: 'completed' }),
    ),
    getVideo: vi.fn(
      async (_jobId: string, _options?: { abortSignal?: AbortSignal }) => ({
        jobId: 'job-1',
        url: 'https://example.com/v.mp4',
      }),
    ),
  }
}

describe('video job abortSignal', () => {
  it('getVideoJobStatus forwards the signal and rejects on abort', async () => {
    const adapter = videoAdapter('hang')
    const controller = new AbortController()
    const pending = getVideoJobStatus({
      adapter,
      jobId: 'job-1',
      abortSignal: controller.signal,
    })
    await vi.waitFor(() => expect(adapter.getVideoStatus).toHaveBeenCalled())
    const passed = adapter.getVideoStatus.mock.calls[0]![1]?.abortSignal
    expect(passed?.aborted).toBe(false)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(passed?.aborted).toBe(true)
  })

  it('getVideoJobStatus timeout rejects instead of reporting a failed job', async () => {
    const adapter = videoAdapter('hang')
    await expect(
      getVideoJobStatus({ adapter, jobId: 'job-1', timeout: 5 }),
    ).rejects.toMatchObject({ name: 'TimeoutError' })
  })

  it('getVideoJobStatus passes the signal to getVideo, and none without it', async () => {
    const adapter = videoAdapter('complete')
    const controller = new AbortController()
    await getVideoJobStatus({
      adapter,
      jobId: 'job-1',
      abortSignal: controller.signal,
    })
    expect(adapter.getVideo.mock.calls[0]![1]?.abortSignal).toBeDefined()

    const plain = videoAdapter('complete')
    const result = await getVideoJobStatus({ adapter: plain, jobId: 'job-1' })
    expect(result.status).toBe('completed')
    expect(plain.getVideoStatus.mock.calls[0]![1]).toBeUndefined()
    expect(plain.getVideo.mock.calls[0]![1]).toBeUndefined()
  })

  it('the streaming poll passes the signal to status and download', async () => {
    const adapter = videoAdapter('complete')
    const controller = new AbortController()
    const chunks: Array<StreamChunk> = []
    for await (const chunk of generateVideo({
      adapter,
      prompt: 'a cat',
      threadId: 't1',
      stream: true,
      pollingInterval: 1,
      abortSignal: controller.signal,
    })) {
      chunks.push(chunk)
    }
    expect(chunks.at(-1)?.type).toBe('RUN_FINISHED')
    expect(adapter.getVideoStatus.mock.calls[0]![1]?.abortSignal).toBe(
      controller.signal,
    )
    expect(adapter.getVideo.mock.calls[0]![1]?.abortSignal).toBe(
      controller.signal,
    )
  })
})

describe('generateVideo cancelVideoJob', () => {
  async function abortAfterJob(
    cancelVideoJob?: (jobId: string) => Promise<void>,
  ) {
    const adapter = { ...videoAdapter('hang'), cancelVideoJob }
    const controller = new AbortController()
    const chunks: Array<StreamChunk> = []
    for await (const chunk of generateVideo({
      adapter,
      prompt: 'a cat',
      threadId: 't1',
      stream: true,
      pollingInterval: 1,
      abortSignal: controller.signal,
      debug: false,
    })) {
      chunks.push(chunk)
      if (chunk.type === 'CUSTOM' && chunk.name === 'video:job:created') {
        void vi
          .waitFor(() => expect(adapter.getVideoStatus).toHaveBeenCalled())
          .then(() => controller.abort())
      }
    }
    return chunks
  }

  it('asks the provider to cancel the job when the caller aborts', async () => {
    const cancel = vi.fn(async (_jobId: string) => {})
    const chunks = await abortAfterJob(cancel)
    expect(chunks.at(-1)?.type).toBe('RUN_ERROR')
    expect(cancel).toHaveBeenCalledWith('job-1')
  })

  it('a failed cancel does not change the abort result', async () => {
    const cancel = vi.fn(async (_jobId: string) => {
      throw new Error('cancel failed')
    })
    const chunks = await abortAfterJob(cancel)
    const last = chunks.at(-1)
    expect(last?.type).toBe('RUN_ERROR')
    expect(last && 'message' in last && last.message).not.toContain(
      'cancel failed',
    )
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('an adapter without cancelVideoJob still aborts', async () => {
    const chunks = await abortAfterJob(undefined)
    expect(chunks.at(-1)?.type).toBe('RUN_ERROR')
  })

  it('a finished run does not cancel', async () => {
    const cancel = vi.fn(async (_jobId: string) => {})
    const adapter = { ...videoAdapter('complete'), cancelVideoJob: cancel }
    for await (const _chunk of generateVideo({
      adapter,
      prompt: 'a cat',
      threadId: 't1',
      stream: true,
      pollingInterval: 1,
      abortSignal: new AbortController().signal,
    })) {
      // drain
    }
    expect(cancel).not.toHaveBeenCalled()
  })
})

describe('files abortSignal', () => {
  function filesAdapter() {
    const handle = { id: 'f1', provider: 'mock' as const }
    const signals: Array<AbortSignal | undefined> = []
    const argCounts: Array<number> = []
    const call = (...args: Array<unknown>) => {
      argCounts.push(args.length)
      const options = args[1] as { abortSignal?: AbortSignal } | undefined
      signals.push(options?.abortSignal)
      return options?.abortSignal
        ? untilAbort<never>(options.abortSignal)
        : Promise.resolve(handle)
    }
    const adapter: FilesAdapter<'mock'> & { kind: 'files' } = {
      kind: 'files',
      name: 'mock',
      upload: (...args) => call(...args),
      get: (...args) => call(...args),
      delete: (...args) => call(...args).then(() => undefined),
    }
    return { adapter, signals, argCounts }
  }

  it.each(['upload', 'get', 'delete'] as const)(
    '%s forwards the signal and rejects on abort',
    async (method) => {
      const { adapter, signals } = filesAdapter()
      const controller = new AbortController()
      const pending =
        method === 'upload'
          ? uploadFile({
              adapter,
              input: new Blob(['x']),
              abortSignal: controller.signal,
            })
          : method === 'get'
            ? getFile({ adapter, id: 'f1', abortSignal: controller.signal })
            : deleteFile({ adapter, id: 'f1', abortSignal: controller.signal })
      expect(signals[0]).toBe(controller.signal)
      controller.abort()
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    },
  )

  it('calls the adapter without options when no signal is set', async () => {
    const { adapter, argCounts } = filesAdapter()
    await uploadFile({ adapter, input: new Blob(['x']) })
    await getFile({ adapter, id: 'f1' })
    await deleteFile({ adapter, id: 'f1' })
    expect(argCounts).toEqual([1, 1, 1])
  })
})

describe('realtimeToken() abortSignal', () => {
  it('forwards the signal and rejects on abort', async () => {
    let received: AbortSignal | undefined
    const adapter: RealtimeTokenAdapter = {
      provider: 'mock',
      generateToken: (options) => {
        received = options?.abortSignal
        return untilAbort(options?.abortSignal)
      },
    }
    const controller = new AbortController()
    const pending = realtimeToken({ adapter, abortSignal: controller.signal })
    expect(received).toBe(controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('calls generateToken with no arguments when no signal is set', async () => {
    const generateToken = vi.fn(async () => ({
      provider: 'mock',
      token: 't',
      expiresAt: 0,
      config: {},
    }))
    await realtimeToken({ adapter: { provider: 'mock', generateToken } })
    expect(generateToken).toHaveBeenCalledWith()
  })
})

describe('decide() and rerank() timeout', () => {
  it('decide() rejects on timeout and reports onAbort', async () => {
    const rec = recorder()
    let received: AbortSignal | undefined
    const adapter: EvaluateAdapter<string, object> = {
      kind: 'evaluate',
      name: 'mock',
      model: 'mock-model',
      '~types': { providerOptions: {} },
      evaluate: (opts) => {
        received = opts.abortSignal
        // Ignores the signal: the race still rejects.
        return new Promise(() => {})
      },
    }
    await expect(
      decide({
        adapter,
        state: { text: 'hi' },
        questions: {
          kind: choice({ instructions: 'Pick one', options: { a: 'A' } }),
        },
        timeout: 5,
        middleware: [rec.middleware],
      }),
    ).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(received?.aborted).toBe(true)
    expect(rec.aborts).toHaveLength(1)
    expect(rec.errors).toHaveLength(0)
  })

  it('rerank() rejects on timeout and reports onAbort', async () => {
    const rec = recorder()
    let received: AbortSignal | undefined
    const adapter: RerankAdapter<string, object> = {
      kind: 'rerank',
      name: 'mock',
      model: 'mock-model',
      '~types': { providerOptions: {} },
      rerank: (opts) => {
        received = opts.abortSignal
        return new Promise(() => {})
      },
    }
    await expect(
      rerank({
        adapter,
        query: 'q',
        documents: ['a'],
        timeout: 5,
        middleware: [rec.middleware],
      }),
    ).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(received?.aborted).toBe(true)
    expect(rec.aborts).toHaveLength(1)
  })
})

/** An error a provider SDK throws on its own fetch timeout. */
function providerTimeout(): Error {
  const error = new Error('provider timed out')
  error.name = 'TimeoutError'
  return error
}

describe('a provider TimeoutError without a caller abort', () => {
  it('generateVideo does not cancel the job', async () => {
    const cancel = vi.fn(async (_jobId: string) => {})
    const adapter = { ...videoAdapter('complete'), cancelVideoJob: cancel }
    adapter.getVideoStatus.mockRejectedValueOnce(providerTimeout())
    for await (const _chunk of generateVideo({
      adapter,
      prompt: 'a cat',
      threadId: 't1',
      stream: true,
      pollingInterval: 1,
      debug: false,
    })) {
      // drain
    }
    expect(adapter.getVideoStatus).toHaveBeenCalled()
    expect(cancel).not.toHaveBeenCalled()
  })

  it('getVideoJobStatus reports a failed job and calls onError', async () => {
    const adapter = videoAdapter('complete')
    adapter.getVideo.mockRejectedValueOnce(providerTimeout())
    const rec = recorder()
    const result = await getVideoJobStatus({
      adapter,
      jobId: 'job-1',
      middleware: [rec.middleware],
    })
    expect(result.status).toBe('failed')
    expect(rec.errors).toHaveLength(1)
    expect(rec.aborts).toHaveLength(0)
  })

  it('embed calls onError, not onAbort', async () => {
    const adapter = new HangingEmbeddingAdapter()
    adapter.createEmbeddings = () => Promise.reject(providerTimeout())
    const rec = recorder()
    await expect(
      embed({ adapter, input: 'a', middleware: [rec.middleware] }),
    ).rejects.toThrow('provider timed out')
    expect(rec.errors).toHaveLength(1)
    expect(rec.aborts).toHaveLength(0)
  })

  it('rerank calls onError, not onAbort', async () => {
    const adapter: RerankAdapter<string, object> = {
      kind: 'rerank',
      name: 'mock',
      model: 'mock-model',
      '~types': { providerOptions: {} },
      rerank: () => Promise.reject(providerTimeout()),
    }
    const rec = recorder()
    await expect(
      rerank({
        adapter,
        query: 'q',
        documents: ['a'],
        middleware: [rec.middleware],
      }),
    ).rejects.toThrow('provider timed out')
    expect(rec.errors).toHaveLength(1)
    expect(rec.aborts).toHaveLength(0)
  })
})

describe('the timeout timer when onStart throws', () => {
  const failingStart: GenerationMiddleware = {
    name: 'fail-start',
    onStart: () => {
      throw new Error('onStart failed')
    },
  }

  it.each(['embed', 'rerank', 'decide'] as const)(
    '%s clears the timer',
    async (activity) => {
      vi.useFakeTimers()
      try {
        const pending =
          activity === 'embed'
            ? embed({
                adapter: new HangingEmbeddingAdapter(),
                input: 'a',
                timeout: 60_000,
                middleware: [failingStart],
              })
            : activity === 'rerank'
              ? rerank({
                  adapter: {
                    kind: 'rerank',
                    name: 'mock',
                    model: 'mock-model',
                    '~types': { providerOptions: {} },
                    rerank: () => new Promise(() => {}),
                  },
                  query: 'q',
                  documents: ['a'],
                  timeout: 60_000,
                  middleware: [failingStart],
                })
              : decide({
                  adapter: {
                    kind: 'evaluate',
                    name: 'mock',
                    model: 'mock-model',
                    '~types': { providerOptions: {} },
                    evaluate: () => new Promise(() => {}),
                  },
                  state: { text: 'hi' },
                  questions: {
                    kind: choice({
                      instructions: 'Pick one',
                      options: { a: 'A' },
                    }),
                  },
                  timeout: 60_000,
                  middleware: [failingStart],
                })
        await expect(pending).rejects.toThrow('onStart failed')
        expect(vi.getTimerCount()).toBe(0)
      } finally {
        vi.useRealTimers()
      }
    },
  )
})
