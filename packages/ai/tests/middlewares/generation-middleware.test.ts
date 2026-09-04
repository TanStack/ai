import { describe, expect, it, vi } from 'vitest'
import {
  generateAudio,
  generateImage,
  generateSpeech,
  generateTranscription,
  generateVideo,
  generateWorld,
  getVideoJobStatus,
  summarize,
} from '../../src/index'
import { otelMiddleware } from '../../src/middlewares/otel'
import { createFakeTracer } from './fake-otel'
import type {
  GenerationAbortInfo,
  GenerationErrorInfo,
  GenerationFinishInfo,
  GenerationMiddleware,
  GenerationMiddlewareContext,
  GenerationUsageInfo,
} from '../../src/activities/middleware'

// A recording middleware that satisfies the base GenerationMiddleware contract.
// Each media activity passes the same per-call context object to every hook, so
// capturing the context lets us assert correlation (start ↔ finish) directly.
function recordingMiddleware() {
  const events = {
    start: [] as Array<GenerationMiddlewareContext>,
    usage: [] as Array<{
      ctx: GenerationMiddlewareContext
      info: GenerationUsageInfo
    }>,
    finish: [] as Array<{
      ctx: GenerationMiddlewareContext
      info: GenerationFinishInfo
    }>,
    abort: [] as Array<{
      ctx: GenerationMiddlewareContext
      info: GenerationAbortInfo
    }>,
    error: [] as Array<{
      ctx: GenerationMiddlewareContext
      info: GenerationErrorInfo
    }>,
  }
  const middleware: GenerationMiddleware = {
    name: 'rec',
    onStart: (ctx) => {
      events.start.push(ctx)
    },
    onUsage: (ctx, info) => {
      events.usage.push({ ctx, info })
    },
    onFinish: (ctx, info) => {
      events.finish.push({ ctx, info })
    },
    onAbort: (ctx, info) => {
      events.abort.push({ ctx, info })
    },
    onError: (ctx, info) => {
      events.error.push({ ctx, info })
    },
  }
  return { middleware, events }
}

describe('generation middleware — wiring', () => {
  it('generateImage fires start, usage, then finish', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = {
      kind: 'image' as const,
      name: 'openai',
      model: 'gpt-image-1',
      generateImages: vi.fn(async () => ({
        images: [{ url: 'https://example.com/i.png' }],
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          unitsBilled: 1,
          cost: 0.04,
        },
      })),
    }

    const result = await generateImage({
      adapter: adapter as any,
      prompt: 'a sunset',
      middleware: [middleware],
    })

    expect(result.images).toHaveLength(1)
    expect(events.start).toHaveLength(1)
    expect(events.start[0]!.activity).toBe('image')
    expect(events.start[0]!.provider).toBe('openai')
    expect(events.usage).toHaveLength(1)
    expect(events.usage[0]!.info.cost).toBe(0.04)
    expect(events.finish).toHaveLength(1)
    expect(events.finish[0]!.info.usage?.cost).toBe(0.04)
    expect(events.error).toHaveLength(0)
    // start/finish share the correlation id (same context object).
    expect(events.finish[0]!.ctx.requestId).toBe(events.start[0]!.requestId)
  })

  it('generateWorld fires start then finish', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = {
      kind: 'world' as const,
      name: 'reactor',
      model: 'visko-orbis-stable',
      createWorld: vi.fn(async () => ({
        id: 'world-1',
        model: 'reactor/visko-orbis-stable',
        token: 'jwt',
        expiresAt: Date.now() + 60_000,
        prompt: 'a world',
        status: 'ready' as const,
      })),
    }

    const result = await generateWorld({
      adapter: adapter as any,
      prompt: 'a world',
      middleware: [middleware],
      debug: false,
    })

    expect(result.token).toBe('jwt')
    expect(events.start).toHaveLength(1)
    expect(events.start[0]!.activity).toBe('world')
    expect(events.start[0]!.provider).toBe('reactor')
    expect(events.finish).toHaveLength(1)
    expect(events.error).toHaveLength(0)
    expect(events.finish[0]!.ctx.requestId).toBe(events.start[0]!.requestId)
  })

  it('generateImage fires error and rethrows', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = {
      kind: 'image' as const,
      name: 'openai',
      model: 'gpt-image-1',
      generateImages: vi.fn(async () => {
        throw new Error('image boom')
      }),
    }

    await expect(
      generateImage({
        adapter: adapter as any,
        prompt: 'x',
        middleware: [middleware],
        debug: false,
      }),
    ).rejects.toThrow('image boom')

    expect(events.start).toHaveLength(1)
    expect(events.finish).toHaveLength(0)
    expect(events.error).toHaveLength(1)
    expect((events.error[0]!.info.error as Error).message).toBe('image boom')
  })

  it('generateImage with otelMiddleware produces a span', async () => {
    const { tracer, spans } = createFakeTracer()
    const adapter = {
      kind: 'image' as const,
      name: 'openai',
      model: 'gpt-image-1',
      generateImages: vi.fn(async () => ({
        images: [{ url: 'https://example.com/i.png' }],
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cost: 0.02,
        },
      })),
    }

    await generateImage({
      adapter: adapter as any,
      prompt: 'a sunset',
      middleware: [otelMiddleware({ tracer })],
    })

    expect(spans).toHaveLength(1)
    expect(spans[0]!.attributes['gen_ai.operation.name']).toBe(
      'image_generation',
    )
    expect(spans[0]!.attributes['gen_ai.usage.cost']).toBe(0.02)
    expect(spans[0]!.ended).toBe(true)
  })

  it('generateSpeech reports the tts activity and fires usage/finish', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = {
      kind: 'tts' as const,
      name: 'openai',
      model: 'gpt-4o-mini-tts',
      generateSpeech: vi.fn(async () => ({
        audio: 'base64',
        format: 'mp3',
        contentType: 'audio/mpeg',
        usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 },
      })),
    }

    await generateSpeech({
      adapter: adapter as any,
      text: 'hello',
      middleware: [middleware],
    })

    expect(events.start[0]!.activity).toBe('tts')
    expect(events.finish[0]!.info.usage?.promptTokens).toBe(5)
  })

  it('generateTranscription fires start/finish', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = {
      kind: 'transcription' as const,
      name: 'openai',
      model: 'whisper-1',
      transcribe: vi.fn(async () => ({
        text: 'hello world',
        language: 'en',
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          durationSeconds: 4,
        },
      })),
    }

    await generateTranscription({
      adapter: adapter as any,
      audio: 'base64',
      middleware: [middleware],
    })

    expect(events.start[0]!.activity).toBe('transcription')
    expect(events.finish[0]!.info.usage?.durationSeconds).toBe(4)
  })

  it('generateAudio fires start/finish', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = {
      kind: 'audio' as const,
      name: 'fal',
      model: 'fal-ai/diffrhythm',
      generateAudio: vi.fn(async () => ({
        audio: { url: 'https://example.com/a.mp3', contentType: 'audio/mpeg' },
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          unitsBilled: 1,
        },
      })),
    }

    await generateAudio({
      adapter: adapter as any,
      prompt: 'an upbeat track',
      middleware: [middleware],
    })

    expect(events.start[0]!.activity).toBe('audio')
    expect(events.finish[0]!.info.usage?.unitsBilled).toBe(1)
  })

  // Regression: the submit used to fire onFinish, so persistence stamped a run
  // `completed` the moment the job was QUEUED — no url, no blob, no artifacts —
  // and the eventual result had nowhere to land. Submitting opens the run; the
  // poll that sees a terminal job state closes it.
  it('generateVideo (non-streaming) opens the run without finishing it', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = {
      kind: 'video' as const,
      name: 'openai',
      model: 'sora-2',
      createVideoJob: vi.fn(async () => ({ jobId: 'job-1', model: 'sora-2' })),
      getVideoStatus: vi.fn(),
      getVideoUrl: vi.fn(),
    }

    const job = await generateVideo({
      adapter: adapter as any,
      prompt: 'a cat',
      threadId: 'video:slot',
      middleware: [middleware],
    })

    expect(job.jobId).toBe('job-1')
    expect(events.start[0]!.activity).toBe('video')
    // The identity persistence keys on reached the middleware — without it,
    // `withGenerationPersistence` throws for want of a scope.
    expect(events.start[0]!.threadId).toBe('video:slot')
    // Keyed on the provider job, so a later poll can recompute it from the
    // jobId alone. Nothing about the run has to be carried by the caller.
    expect(events.start[0]!.runId).toBe('video:openai:job-1')
    expect(events.finish).toHaveLength(0)
    expect(events.error).toHaveLength(0)
    // Correlation rides the jobId; nothing extra is bolted onto the result.
    expect(job).not.toHaveProperty('runId')
  })

  it('generateVideo (non-streaming) finishes a live session on create', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = {
      kind: 'video' as const,
      name: 'reactor',
      model: 'helios',
      createVideoJob: vi.fn(async () => ({
        jobId: 'video-1',
        model: 'reactor/helios',
        token: 'jwt-live',
        expiresAt: 1,
        prompt: 'a city',
      })),
      getVideoStatus: vi.fn(),
      getVideoUrl: vi.fn(),
    }

    const job = await generateVideo({
      adapter: adapter as any,
      prompt: 'a city',
      threadId: 'video:live',
      middleware: [middleware],
    })

    expect(job.token).toBe('jwt-live')
    expect(events.start[0]!.runId).toBe('video:reactor:video-1')
    expect(events.finish).toHaveLength(1)
    expect(events.error).toHaveLength(0)
  })

  // The submit is not free to pick its own id: the poll can only recompute one
  // derived from the job, so honoring a custom id here would resurrect exactly
  // the "forgot to pass it through" split-record bug this design removes.
  it('generateVideo (non-streaming) ignores a caller-supplied runId', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = {
      kind: 'video' as const,
      name: 'openai',
      model: 'sora-2',
      createVideoJob: vi.fn(async () => ({ jobId: 'job-1', model: 'sora-2' })),
      getVideoStatus: vi.fn(),
      getVideoUrl: vi.fn(),
    }

    await generateVideo({
      adapter: adapter as any,
      prompt: 'a cat',
      threadId: 'video:slot',
      runId: 'run-fixed',
      middleware: [middleware],
    })

    expect(events.start[0]!.runId).toBe('video:openai:job-1')
  })

  it('generateVideo (non-streaming) keys the run per provider', async () => {
    const jobFor = (name: string) => ({
      kind: 'video' as const,
      name,
      model: 'sora-2',
      createVideoJob: vi.fn(async () => ({ jobId: 'job-1', model: 'sora-2' })),
      getVideoStatus: vi.fn(),
      getVideoUrl: vi.fn(),
    })
    const { middleware, events } = recordingMiddleware()

    await generateVideo({
      adapter: jobFor('openai') as any,
      prompt: 'a cat',
      threadId: 'video:slot',
      middleware: [middleware],
    })
    await generateVideo({
      adapter: jobFor('fal') as any,
      prompt: 'a cat',
      threadId: 'video:slot',
      middleware: [middleware],
    })

    // Two providers can hand out the same job id; their runs must not collide.
    expect(events.start[0]!.runId).not.toBe(events.start[1]!.runId)
  })

  it('generateVideo (non-streaming) applies result transforms to the submission', async () => {
    const adapter = {
      kind: 'video' as const,
      name: 'openai',
      model: 'sora-2',
      createVideoJob: vi.fn(async () => ({ jobId: 'job-1', model: 'sora-2' })),
      getVideoStatus: vi.fn(),
      getVideoUrl: vi.fn(),
    }

    const recorded: Array<unknown> = []
    const transforming: GenerationMiddleware = {
      name: 'transform',
      onStart: (ctx) => {
        ctx.resultTransforms.push((result) => {
          recorded.push(result)
          return undefined
        })
      },
    }

    await generateVideo({
      adapter: adapter as any,
      prompt: 'a cat',
      threadId: 'video:slot',
      middleware: [transforming],
    })

    // The jobId reaches the run record at submission time, which is what makes
    // a job resumable from a later request.
    expect(recorded[0]).toMatchObject({ jobId: 'job-1' })
  })

  // A failed submit has no job to key on, so it opens and immediately fails a
  // run under the request id: `generationRuns.update` on an unknown run id is a
  // documented no-op, so without the start the failure would persist nowhere and
  // the thread would hydrate as if nothing had been asked for.
  it('generateVideo (non-streaming) opens and fails a run when submission fails', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = {
      kind: 'video' as const,
      name: 'openai',
      model: 'sora-2',
      createVideoJob: vi.fn(async () => {
        throw new Error('submit boom')
      }),
      getVideoStatus: vi.fn(),
      getVideoUrl: vi.fn(),
    }

    await expect(
      generateVideo({
        adapter: adapter as any,
        prompt: 'a cat',
        threadId: 'video:slot',
        middleware: [middleware],
        debug: false,
      }),
    ).rejects.toThrow('submit boom')

    expect(events.start).toHaveLength(1)
    expect(events.error).toHaveLength(1)
    expect(events.finish).toHaveLength(0)
    // No job, so no derived id — persistence falls back to the request id. The
    // record is terminal and unresumable by construction, but it is filed under
    // the thread, so a hydrating client sees the failure.
    expect(events.start[0]!.runId).toBeUndefined()
    expect(events.start[0]!.threadId).toBe('video:slot')
  })

  it('getVideoJobStatus finishes the submitted run, transforming the result', async () => {
    const adapter = {
      kind: 'video' as const,
      name: 'openai',
      model: 'sora-2',
      createVideoJob: vi.fn(async () => ({ jobId: 'job-1', model: 'sora-2' })),
      getVideoStatus: vi.fn(async () => ({ status: 'completed' as const })),
      getVideoUrl: vi.fn(async () => ({
        url: 'https://provider.test/v.mp4',
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          unitsBilled: 1,
        },
      })),
    }

    const { middleware, events } = recordingMiddleware()
    const transforming: GenerationMiddleware = {
      name: 'transform',
      onStart: (ctx) => {
        ctx.resultTransforms.push((result) => ({
          ...(result as Record<string, unknown>),
          url: 'https://app.test/api/artifacts?id=a1',
        }))
      },
    }

    const job = await generateVideo({
      adapter: adapter as any,
      prompt: 'a cat',
      threadId: 'video:slot',
      middleware: [middleware, transforming],
    })

    // Only the jobId crosses from the submit to the poll — the run id is
    // recomputed from it, so the two halves cannot drift apart.
    const status = await getVideoJobStatus({
      adapter: adapter as any,
      jobId: job.jobId,
      threadId: 'video:slot',
      middleware: [middleware, transforming],
    })

    // The durable url the transform stamped is what the caller gets back, so
    // the live result and the stored record cannot disagree.
    expect(status).toMatchObject({
      jobId: 'job-1',
      status: 'completed',
      url: 'https://app.test/api/artifacts?id=a1',
    })
    // One run, closed exactly once, under the submission's identity.
    expect(events.finish).toHaveLength(1)
    expect(events.finish[0]!.ctx.runId).toBe(events.start[0]!.runId)
    expect(events.finish[0]!.ctx.runId).toBe('video:openai:job-1')
    expect(events.finish[0]!.ctx.threadId).toBe('video:slot')
    expect(events.finish[0]!.info.usage?.unitsBilled).toBe(1)
    expect(events.usage).toHaveLength(1)
    expect(events.error).toHaveLength(0)
  })

  // The point of deriving the id: the poll typically happens in a LATER request
  // with a freshly constructed adapter and no memory of the submit.
  it('getVideoJobStatus rejoins the run from a separate adapter instance', async () => {
    const makeAdapter = () => ({
      kind: 'video' as const,
      name: 'openai',
      model: 'sora-2',
      createVideoJob: vi.fn(async () => ({ jobId: 'job-9', model: 'sora-2' })),
      getVideoStatus: vi.fn(async () => ({ status: 'completed' as const })),
      getVideoUrl: vi.fn(async () => ({ url: 'https://provider.test/v.mp4' })),
    })

    const { middleware, events } = recordingMiddleware()
    const { jobId } = await generateVideo({
      adapter: makeAdapter() as any,
      prompt: 'a cat',
      threadId: 'video:slot',
      middleware: [middleware],
    })

    await getVideoJobStatus({
      adapter: makeAdapter() as any,
      jobId,
      threadId: 'video:slot',
      middleware: [middleware],
    })

    expect(events.finish[0]!.ctx.runId).toBe(events.start[0]!.runId)
  })

  // Generation persistence refuses a run with no scope (one filed under none can
  // never be hydrated by one), so a poll that drops the threadId must fail loudly
  // instead of filing the finished video somewhere unreachable. Modelled here
  // with a middleware that refuses the same way `generationScope` does.
  it('getVideoJobStatus surfaces a scope-less poll instead of degrading', async () => {
    const scopeRequiring: GenerationMiddleware = {
      name: 'scope-required',
      onStart: (ctx) => {
        if (!ctx.threadId) throw new Error('Generation persistence requires a')
      },
    }
    const adapter = {
      kind: 'video' as const,
      name: 'openai',
      model: 'sora-2',
      createVideoJob: vi.fn(),
      getVideoStatus: vi.fn(async () => ({ status: 'completed' as const })),
      getVideoUrl: vi.fn(async () => ({ url: 'https://provider.test/v.mp4' })),
    }

    await expect(
      getVideoJobStatus({
        adapter: adapter as any,
        jobId: 'job-1',
        middleware: [scopeRequiring],
      }),
    ).rejects.toThrow('Generation persistence requires a')
  })

  it('getVideoJobStatus leaves the run open while the job is still running', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = {
      kind: 'video' as const,
      name: 'openai',
      model: 'sora-2',
      createVideoJob: vi.fn(),
      getVideoStatus: vi.fn(async () => ({
        status: 'processing' as const,
        progress: 42,
      })),
      getVideoUrl: vi.fn(),
    }

    const status = await getVideoJobStatus({
      adapter: adapter as any,
      jobId: 'job-1',
      threadId: 'video:slot',
      middleware: [middleware],
    })

    expect(status).toMatchObject({ status: 'processing', progress: 42 })
    // An in-progress poll is not a lifecycle event: firing hooks here would
    // open a span (and re-resume the run) on every tick of a poll loop.
    expect(events.start).toHaveLength(0)
    expect(events.finish).toHaveLength(0)
    expect(events.error).toHaveLength(0)
    expect(adapter.getVideoUrl).not.toHaveBeenCalled()
  })

  it('getVideoJobStatus fails the run when the job failed', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = {
      kind: 'video' as const,
      name: 'openai',
      model: 'sora-2',
      createVideoJob: vi.fn(),
      getVideoStatus: vi.fn(async () => ({
        status: 'failed' as const,
        error: 'moderation',
      })),
      getVideoUrl: vi.fn(),
    }

    const status = await getVideoJobStatus({
      adapter: adapter as any,
      jobId: 'job-1',
      threadId: 'video:slot',
      middleware: [middleware],
    })

    expect(status.status).toBe('failed')
    // Otherwise the record sits at `running` forever, indistinguishable from a
    // job still being worked on.
    expect(events.error).toHaveLength(1)
    expect(events.error[0]!.ctx.runId).toBe('video:openai:job-1')
    expect(events.finish).toHaveLength(0)
  })

  it('getVideoJobStatus fails the run when the url fetch fails', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = {
      kind: 'video' as const,
      name: 'openai',
      model: 'sora-2',
      createVideoJob: vi.fn(),
      getVideoStatus: vi.fn(async () => ({ status: 'completed' as const })),
      getVideoUrl: vi.fn(async () => {
        throw new Error('url boom')
      }),
    }

    const status = await getVideoJobStatus({
      adapter: adapter as any,
      jobId: 'job-1',
      threadId: 'video:slot',
      middleware: [middleware],
    })

    expect(status).toMatchObject({ status: 'failed', error: 'url boom' })
    expect(events.error).toHaveLength(1)
    expect(events.finish).toHaveLength(0)
  })

  it('getVideoJobStatus works without middleware', async () => {
    const adapter = {
      kind: 'video' as const,
      name: 'openai',
      model: 'sora-2',
      createVideoJob: vi.fn(),
      getVideoStatus: vi.fn(async () => ({ status: 'completed' as const })),
      getVideoUrl: vi.fn(async () => ({ url: 'https://provider.test/v.mp4' })),
    }

    const status = await getVideoJobStatus({
      adapter: adapter as any,
      jobId: 'job-1',
    })

    expect(status).toMatchObject({
      jobId: 'job-1',
      status: 'completed',
      url: 'https://provider.test/v.mp4',
    })
  })

  it('generateVideo (streaming) fires finish with usage at completion', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = {
      kind: 'video' as const,
      name: 'openai',
      model: 'sora-2',
      createVideoJob: vi.fn(async () => ({ jobId: 'job-1', model: 'sora-2' })),
      getVideoStatus: vi.fn(async () => ({ status: 'completed' as const })),
      getVideoUrl: vi.fn(async () => ({
        url: 'https://example.com/v.mp4',
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          unitsBilled: 1,
        },
      })),
    }

    const stream = generateVideo({
      adapter: adapter as any,
      prompt: 'a cat',
      stream: true,
      pollingInterval: 1,
      middleware: [middleware],
    })
    for await (const _chunk of stream) {
      // drain
    }

    expect(events.start[0]!.activity).toBe('video')
    expect(events.finish).toHaveLength(1)
    expect(events.finish[0]!.info.usage?.unitsBilled).toBe(1)
    expect(events.error).toHaveLength(0)
  })

  // Regression: video was the only media activity that never applied result
  // transforms, and never put the caller's threadId/runId on the middleware
  // context. Persistence registers artifact capture AND the run-record result
  // write as result transforms, so both silently no-opped — a completed video
  // stored no result, no artifacts, and no thread link, and therefore restored
  // as nothing on reload.
  it('generateVideo (streaming) applies result transforms and carries identity', async () => {
    const adapter = {
      kind: 'video' as const,
      name: 'openai',
      model: 'sora-2',
      createVideoJob: vi.fn(async () => ({ jobId: 'job-1', model: 'sora-2' })),
      getVideoStatus: vi.fn(async () => ({ status: 'completed' as const })),
      getVideoUrl: vi.fn(async () => ({ url: 'https://provider.test/v.mp4' })),
    }

    const seen: Array<GenerationMiddlewareContext> = []
    const transforming: GenerationMiddleware = {
      name: 'transform',
      onStart: (ctx) => {
        seen.push(ctx)
        ctx.resultTransforms?.push((result) => ({
          ...(result as Record<string, unknown>),
          url: 'https://app.test/api/artifacts?id=a1',
        }))
      },
    }

    const chunks: Array<{ type: string; name?: string; value?: unknown }> = []
    for await (const chunk of generateVideo({
      adapter: adapter as any,
      prompt: 'a cat',
      stream: true,
      pollingInterval: 1,
      threadId: 'video:slot',
      runId: 'run-abc',
      middleware: [transforming],
    })) {
      chunks.push(chunk as { type: string; name?: string; value?: unknown })
    }

    // The transform rewrote the terminal result the consumer actually sees.
    const terminal = chunks.find((c) => c.name === 'generation:result')
    expect(terminal?.value).toMatchObject({
      jobId: 'job-1',
      status: 'completed',
      url: 'https://app.test/api/artifacts?id=a1',
    })

    // Identity reached the middleware, not just the wire chunks.
    expect(seen[0]).toMatchObject({
      activity: 'video',
      threadId: 'video:slot',
      runId: 'run-abc',
    })
  })

  it('generateVideo (streaming) records no thread link when the caller passes none', async () => {
    const adapter = {
      kind: 'video' as const,
      name: 'openai',
      model: 'sora-2',
      createVideoJob: vi.fn(async () => ({ jobId: 'job-1', model: 'sora-2' })),
      getVideoStatus: vi.fn(async () => ({ status: 'completed' as const })),
      getVideoUrl: vi.fn(async () => ({ url: 'https://provider.test/v.mp4' })),
    }

    const { middleware, events } = recordingMiddleware()
    const chunks: Array<{ type: string; threadId?: string }> = []
    for await (const chunk of generateVideo({
      adapter: adapter as any,
      prompt: 'a cat',
      stream: true,
      pollingInterval: 1,
      middleware: [middleware],
    })) {
      chunks.push(chunk as { type: string; threadId?: string })
    }

    // The wire still needs a thread id on RUN_* chunks...
    const started = chunks.find((c) => c.type === 'RUN_STARTED')
    expect(typeof started?.threadId).toBe('string')
    // ...but the minted one must NOT reach persistence: a fabricated id is a
    // slot no client can hydrate, which is worse than recording no link.
    expect(events.start[0]!.threadId).toBeUndefined()
  })

  it('generateVideo (streaming) fires error when the job fails', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = {
      kind: 'video' as const,
      name: 'openai',
      model: 'sora-2',
      createVideoJob: vi.fn(async () => ({ jobId: 'job-1', model: 'sora-2' })),
      getVideoStatus: vi.fn(async () => ({
        status: 'failed' as const,
        error: 'generation failed',
      })),
      getVideoUrl: vi.fn(),
    }

    const stream = generateVideo({
      adapter: adapter as any,
      prompt: 'a cat',
      stream: true,
      pollingInterval: 1,
      middleware: [middleware],
      debug: false,
    })
    for await (const _chunk of stream) {
      // drain — error surfaces as a RUN_ERROR chunk, not a throw
    }

    expect(events.finish).toHaveLength(0)
    expect(events.error).toHaveLength(1)
    expect(events.error[0]!.ctx.activity).toBe('video')
  })

  it('generateVideo (streaming) does not double-fire onAbort when an onError hook throws', async () => {
    const errorCalls: Array<GenerationErrorInfo> = []
    const abortCalls: Array<GenerationAbortInfo> = []
    const throwingOnError: GenerationMiddleware = {
      name: 'throws-on-error',
      onError: (_ctx, info) => {
        errorCalls.push(info)
        throw new Error('onError boom')
      },
      onAbort: (_ctx, info) => {
        abortCalls.push(info)
      },
    }
    const adapter = {
      kind: 'video' as const,
      name: 'openai',
      model: 'sora-2',
      createVideoJob: vi.fn(async () => ({ jobId: 'job-1', model: 'sora-2' })),
      getVideoStatus: vi.fn(async () => ({
        status: 'failed' as const,
        error: 'generation failed',
      })),
      getVideoUrl: vi.fn(),
    }

    const stream = generateVideo({
      adapter: adapter as any,
      prompt: 'a cat',
      stream: true,
      pollingInterval: 1,
      middleware: [throwingOnError],
      debug: false,
    })

    // The error-hook throws, so draining the stream rejects with that error...
    await expect(
      (async () => {
        for await (const _chunk of stream) {
          // drain
        }
      })(),
    ).rejects.toThrow('onError boom')

    // ...but the terminal hook must stay exactly-once: a thrown onError must
    // not let the `finally` double-fire onAbort over the same operation.
    expect(errorCalls).toHaveLength(1)
    expect(abortCalls).toHaveLength(0)
  })

  it('generateVideo (streaming) fires onAbort if the consumer abandons mid-poll', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = {
      kind: 'video' as const,
      name: 'openai',
      model: 'sora-2',
      createVideoJob: vi.fn(async () => ({ jobId: 'job-1', model: 'sora-2' })),
      // Never completes, so the poll loop keeps running until we abandon it.
      getVideoStatus: vi.fn(async () => ({ status: 'in_progress' as const })),
      getVideoUrl: vi.fn(),
    }

    const stream = generateVideo({
      adapter: adapter as any,
      prompt: 'a cat',
      stream: true,
      pollingInterval: 1,
      middleware: [middleware],
      debug: false,
    })
    for await (const chunk of stream) {
      // Abandon once the job is created — onStart has fired and the span is open.
      if ((chunk as { name?: string }).name === 'video:job:created') break
    }

    expect(events.start).toHaveLength(1)
    expect(events.finish).toHaveLength(0)
    // Abandonment is a cancel, not an error: the `finally` fires onAbort so the
    // span is ended as cancelled rather than leaked.
    expect(events.error).toHaveLength(0)
    expect(events.abort).toHaveLength(1)
  })

  it('generateVideo (streaming) fires finish (not abort) when the consumer stops after the result', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = {
      kind: 'video' as const,
      name: 'openai',
      model: 'sora-2',
      createVideoJob: vi.fn(async () => ({ jobId: 'job-1', model: 'sora-2' })),
      getVideoStatus: vi.fn(async () => ({ status: 'completed' as const })),
      getVideoUrl: vi.fn(async () => ({
        url: 'https://example.com/v.mp4',
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          unitsBilled: 1,
        },
      })),
    }

    const stream = generateVideo({
      adapter: adapter as any,
      prompt: 'a cat',
      stream: true,
      pollingInterval: 1,
      middleware: [middleware],
    })
    for await (const chunk of stream) {
      // The generation succeeded; stop reading before pulling RUN_FINISHED.
      if ((chunk as { name?: string }).name === 'generation:result') break
    }

    expect(events.start).toHaveLength(1)
    expect(events.finish).toHaveLength(1)
    expect(events.finish[0]!.info.usage?.unitsBilled).toBe(1)
    // Abandoning after success must not be reported as a cancellation.
    expect(events.abort).toHaveLength(0)
    expect(events.error).toHaveLength(0)
  })

  // `summarize` used to accept no middleware at all, so `useSummarize({
  // persistence: true })` type-checked but no library path could ever write its
  // run record — a promise nothing could keep.
  it('summarize (non-streaming) fires start/usage/finish and transforms the result', async () => {
    const { middleware, events } = recordingMiddleware()
    const transforming: GenerationMiddleware = {
      name: 'transform',
      onStart: (ctx) => {
        ctx.resultTransforms.push((result) => ({
          ...(result as Record<string, unknown>),
          summary: 'rewritten',
        }))
      },
    }
    const adapter = {
      kind: 'summarize' as const,
      name: 'openai',
      model: 'gpt-5.5',
      summarize: vi.fn(async () => ({
        id: 'sum-1',
        model: 'gpt-5.5',
        summary: 'the original',
        usage: { promptTokens: 10, completionTokens: 3, totalTokens: 13 },
      })),
    }

    const result = await summarize({
      adapter: adapter as any,
      text: 'a long article',
      threadId: 'summary:slot',
      runId: 'run-1',
      middleware: [middleware, transforming],
    })

    expect(result.summary).toBe('rewritten')
    expect(events.start).toHaveLength(1)
    expect(events.start[0]!.activity).toBe('summarize')
    expect(events.start[0]!.threadId).toBe('summary:slot')
    expect(events.start[0]!.runId).toBe('run-1')
    expect(events.usage[0]!.info.totalTokens).toBe(13)
    expect(events.finish).toHaveLength(1)
    expect(events.error).toHaveLength(0)
  })

  it('summarize (non-streaming) fires error and rethrows', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = {
      kind: 'summarize' as const,
      name: 'openai',
      model: 'gpt-5.5',
      summarize: vi.fn(async () => {
        throw new Error('summarize boom')
      }),
    }

    await expect(
      summarize({
        adapter: adapter as any,
        text: 'a long article',
        threadId: 'summary:slot',
        middleware: [middleware],
        debug: false,
      }),
    ).rejects.toThrow('summarize boom')

    expect(events.error).toHaveLength(1)
    expect(events.finish).toHaveLength(0)
  })

  it('summarize (streaming, native) transforms the terminal result chunk', async () => {
    const { middleware, events } = recordingMiddleware()
    const transforming: GenerationMiddleware = {
      name: 'transform',
      onStart: (ctx) => {
        ctx.resultTransforms.push((result) => ({
          ...(result as Record<string, unknown>),
          summary: 'rewritten',
        }))
      },
    }
    const adapter = {
      kind: 'summarize' as const,
      name: 'openai',
      model: 'gpt-5.5',
      summarize: vi.fn(),
      summarizeStream: vi.fn(async function* () {
        yield { type: 'TEXT_MESSAGE_CONTENT', delta: 'the ', timestamp: 1 }
        yield { type: 'TEXT_MESSAGE_CONTENT', delta: 'original', timestamp: 2 }
        yield {
          type: 'CUSTOM',
          name: 'generation:result',
          value: {
            id: 'sum-1',
            model: 'gpt-5.5',
            summary: 'the original',
            usage: { promptTokens: 10, completionTokens: 3, totalTokens: 13 },
          },
          timestamp: 3,
        }
        yield { type: 'RUN_FINISHED', runId: 'run-1', timestamp: 4 }
      }),
    }

    const chunks: Array<{ type: string; name?: string; value?: unknown }> = []
    for await (const chunk of summarize({
      adapter: adapter as any,
      text: 'a long article',
      stream: true,
      threadId: 'summary:slot',
      runId: 'run-1',
      middleware: [middleware, transforming],
    })) {
      chunks.push(chunk as { type: string; name?: string; value?: unknown })
    }

    // The rewritten result is what the client sees, so it matches the record.
    const terminal = chunks.find((c) => c.name === 'generation:result')
    expect(terminal?.value).toMatchObject({ summary: 'rewritten' })
    expect(events.start[0]!.activity).toBe('summarize')
    expect(events.start[0]!.threadId).toBe('summary:slot')
    expect(events.finish).toHaveLength(1)
    expect(events.finish[0]!.info.usage?.totalTokens).toBe(13)
    expect(events.abort).toHaveLength(0)
  })

  it('summarize (streaming, native) fires abort when the consumer walks away', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = {
      kind: 'summarize' as const,
      name: 'openai',
      model: 'gpt-5.5',
      summarize: vi.fn(),
      summarizeStream: vi.fn(async function* () {
        yield { type: 'TEXT_MESSAGE_CONTENT', delta: 'partial', timestamp: 1 }
        yield { type: 'TEXT_MESSAGE_CONTENT', delta: ' more', timestamp: 2 }
      }),
    }

    for await (const _chunk of summarize({
      adapter: adapter as any,
      text: 'a long article',
      stream: true,
      threadId: 'summary:slot',
      middleware: [middleware],
    })) {
      break
    }

    expect(events.abort).toHaveLength(1)
    expect(events.finish).toHaveLength(0)
  })

  it('summarize (streaming, fallback) runs middleware around the one-shot call', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = {
      kind: 'summarize' as const,
      name: 'openai',
      model: 'gpt-5.5',
      summarize: vi.fn(async () => ({
        id: 'sum-1',
        model: 'gpt-5.5',
        summary: 'the original',
        usage: { promptTokens: 10, completionTokens: 3, totalTokens: 13 },
      })),
    }

    const chunks: Array<{ type: string; name?: string }> = []
    for await (const chunk of summarize({
      adapter: adapter as any,
      text: 'a long article',
      stream: true,
      threadId: 'summary:slot',
      middleware: [middleware],
    })) {
      chunks.push(chunk as { type: string; name?: string })
    }

    expect(chunks.map((c) => c.type)).toContain('RUN_FINISHED')
    expect(events.start).toHaveLength(1)
    expect(events.finish).toHaveLength(1)
    // `threadId` stays the caller's; only `runId` comes from the wire identity,
    // so the run is filed in a slot a client can actually hydrate.
    expect(events.start[0]!.threadId).toBe('summary:slot')
    expect(typeof events.start[0]!.runId).toBe('string')
  })

  it('summarize with otelMiddleware produces a summarize span', async () => {
    const { tracer, spans } = createFakeTracer()
    const adapter = {
      kind: 'summarize' as const,
      name: 'openai',
      model: 'gpt-5.5',
      summarize: vi.fn(async () => ({
        id: 'sum-1',
        model: 'gpt-5.5',
        summary: 'short',
        usage: { promptTokens: 10, completionTokens: 3, totalTokens: 13 },
      })),
    }

    await summarize({
      adapter: adapter as any,
      text: 'a long article',
      middleware: [otelMiddleware({ tracer })],
    })

    expect(spans).toHaveLength(1)
    expect(spans[0]!.attributes['gen_ai.operation.name']).toBe('summarize')
    expect(spans[0]!.ended).toBe(true)
  })

  it('a throwing middleware hook propagates (matches chat semantics)', async () => {
    const adapter = {
      kind: 'image' as const,
      name: 'openai',
      model: 'gpt-image-1',
      generateImages: vi.fn(async () => ({
        images: [{ url: 'https://example.com/i.png' }],
      })),
    }
    const brokenMiddleware: GenerationMiddleware = {
      name: 'broken',
      onStart: () => {
        throw new Error('middleware broke')
      },
    }

    // Unlike the old observers (which swallowed hook errors), generation
    // middleware hooks propagate so a misbehaving middleware surfaces loudly.
    await expect(
      generateImage({
        adapter: adapter as any,
        prompt: 'x',
        middleware: [brokenMiddleware],
        debug: false,
      }),
    ).rejects.toThrow('middleware broke')
  })
})
