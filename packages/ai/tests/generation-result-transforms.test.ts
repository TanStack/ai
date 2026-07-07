import { describe, expect, it } from 'vitest'
import {
  applyGenerationResultTransforms,
  createGenerationContext,
  runGenerationStart,
} from '../src/activities/middleware/run'
import { generateVideo } from '../src/activities/generateVideo'
import type { GenerationMiddleware } from '../src/activities/middleware'
import type { VideoAdapter } from '../src/activities/generateVideo'
import type { PersistedArtifactRef, StreamChunk } from '../src/types'

describe('applyGenerationResultTransforms', () => {
  type TestResult = { value: string }

  function createTestContext() {
    return createGenerationContext({
      requestId: 'test-request',
      activity: 'image',
      provider: 'test-provider',
      model: 'test-model',
      createId: (prefix) => `${prefix}-id`,
    })
  }

  it('runs transforms in order and passes replacements to later transforms', async () => {
    const ctx = createTestContext()
    const calls: Array<string> = []
    ctx.resultTransforms?.push(
      (result: TestResult) => {
        calls.push(`first:${result.value}`)
        return { value: 'first-replacement' }
      },
      (result: TestResult) => {
        calls.push(`second:${result.value}`)
        return { value: 'second-replacement' }
      },
    )

    const result = await applyGenerationResultTransforms<TestResult>(
      ctx,
      { value: 'raw' },
    )

    expect(calls).toEqual(['first:raw', 'second:first-replacement'])
    expect(result).toEqual({ value: 'second-replacement' })
  })

  it('keeps the prior result when a transform returns undefined', async () => {
    const ctx = createTestContext()
    ctx.resultTransforms?.push(
      () => ({ value: 'first-replacement' }),
      () => undefined,
    )

    const result = await applyGenerationResultTransforms<TestResult>(
      ctx,
      { value: 'raw' },
    )

    expect(result).toEqual({ value: 'first-replacement' })
  })

  it('rejects when a transform throws', async () => {
    const ctx = createTestContext()
    const error = new Error('transform failed')
    ctx.resultTransforms?.push(() => {
      throw error
    })

    await expect(
      applyGenerationResultTransforms<TestResult>(ctx, { value: 'raw' }),
    ).rejects.toThrow(error)
  })

  it('lets middleware register transforms on start', async () => {
    const ctx = createTestContext()
    const middleware = [
      {
        onStart: () => {
          ctx.resultTransforms?.push((result: TestResult) => ({
            value: `${result.value}-registered`,
          }))
        },
      },
    ]

    await runGenerationStart(middleware, ctx)

    await expect(
      applyGenerationResultTransforms<TestResult>(ctx, { value: 'raw' }),
    ).resolves.toEqual({ value: 'raw-registered' })
  })

  it('runs middleware-registered transforms in middleware order', async () => {
    const ctx = createTestContext()
    const middleware = [
      {
        onStart: () => {
          ctx.resultTransforms?.push((result: TestResult) => ({
            value: `${result.value}-first`,
          }))
        },
      },
      {
        onStart: () => {
          ctx.resultTransforms?.push((result: TestResult) => ({
            value: `${result.value}-second`,
          }))
        },
      },
    ]

    await runGenerationStart(middleware, ctx)

    await expect(
      applyGenerationResultTransforms<TestResult>(ctx, { value: 'raw' }),
    ).resolves.toEqual({ value: 'raw-first-second' })
  })

  it('lets one middleware register multiple transforms', async () => {
    const ctx = createTestContext()
    const middleware = [
      {
        onStart: () => {
          ctx.resultTransforms?.push((result: TestResult) => ({
            value: `${result.value}-first`,
          }))
          ctx.resultTransforms?.push((result: TestResult) => ({
            value: `${result.value}-second`,
          }))
        },
      },
    ]

    await runGenerationStart(middleware, ctx)

    await expect(
      applyGenerationResultTransforms<TestResult>(ctx, { value: 'raw' }),
    ).resolves.toEqual({ value: 'raw-first-second' })
  })
})

describe('generateVideo result transforms', () => {
  it('preserves transformed fields in streamed generation result payload', async () => {
    const artifact: PersistedArtifactRef = {
      role: 'output',
      artifactId: 'artifact-1',
      threadId: 'thread-1',
      runId: 'run-1',
      name: 'video.mp4',
      mimeType: 'video/mp4',
      size: 123,
      createdAt: '2026-07-06T00:00:00.000Z',
      source: {
        activity: 'video',
        path: 'video',
        provider: 'test-provider',
        model: 'test-video-model',
        mediaType: 'video',
        jobId: 'transformed-job',
      },
    }
    const adapter: VideoAdapter<string> = {
      kind: 'video',
      name: 'test-provider',
      model: 'test-video-model',
      '~types': undefined as never,
      createVideoJob: async () => ({
        jobId: 'raw-job',
        model: 'test-video-model',
      }),
      getVideoStatus: async () => ({
        jobId: 'raw-job',
        status: 'completed',
      }),
      getVideoUrl: async () => ({
        jobId: 'raw-job',
        url: 'https://example.com/raw.mp4',
      }),
      availableDurations: () => ({ kind: 'none' }),
      snapDuration: () => undefined,
    }
    const middleware: Array<GenerationMiddleware> = [
      {
        onStart: (ctx) => {
          ctx.resultTransforms?.push((result) => ({
            ...result,
            jobId: 'transformed-job',
            artifacts: [artifact],
          }))
        },
      },
    ]

    let terminalResult: StreamChunk | undefined
    for await (const chunk of generateVideo({
      adapter,
      prompt: 'test video',
      stream: true,
      pollingInterval: 0,
      middleware,
    })) {
      if (chunk.type === 'CUSTOM' && chunk.name === 'generation:result') {
        terminalResult = chunk
        break
      }
    }

    expect(terminalResult?.type).toBe('CUSTOM')
    expect(terminalResult?.value).toEqual({
      jobId: 'transformed-job',
      status: 'completed',
      url: 'https://example.com/raw.mp4',
      artifacts: [artifact],
    })
  })
})
