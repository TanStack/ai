import { describe, expect, it, vi } from 'vitest'
import {
  generateAudio,
  generateImage,
  generateSpeech,
  generateTranscription,
  generateVideo,
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

  it('generateVideo (non-streaming) fires start/finish for the submit', async () => {
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
      middleware: [middleware],
    })

    expect(job.jobId).toBe('job-1')
    expect(events.start[0]!.activity).toBe('video')
    expect(events.finish).toHaveLength(1)
    expect(events.finish[0]!.info.usage).toBeUndefined()
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
