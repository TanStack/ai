/**
 * Tests for generateVideo's `previousJobId` option: the core gate that
 * validates edit support before the adapter is called, the passthrough into
 * `createVideoJob`, and the per-model compile-time typing.
 */
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { generateVideo } from '../src/activities/generateVideo'
import { BaseVideoAdapter } from '../src/activities/generateVideo/adapter'
import type { VideoCreateOptions } from '../src/activities/generateVideo'
import type {
  VideoEditKind,
  VideoGenerationOptions,
  VideoJobResult,
  VideoStatusResult,
  VideoUrlResult,
} from '../src/types'

class MockVideoAdapter extends BaseVideoAdapter<'mock-model'> {
  readonly name = 'mock'
  editKind: VideoEditKind | undefined
  lastOptions: VideoGenerationOptions | undefined

  constructor(editKind?: VideoEditKind) {
    super({}, 'mock-model')
    this.editKind = editKind
  }

  override supportedEditKind(): VideoEditKind | undefined {
    return this.editKind
  }

  createVideoJob = vi.fn(
    async (options: VideoGenerationOptions): Promise<VideoJobResult> => {
      this.lastOptions = options
      return { jobId: 'job-1', model: this.model }
    },
  )

  getVideoStatus = vi.fn(
    async (jobId: string): Promise<VideoStatusResult> => ({
      jobId,
      status: 'completed',
    }),
  )

  getVideoUrl = vi.fn(
    async (jobId: string): Promise<VideoUrlResult> => ({
      jobId,
      url: 'https://example.com/video.mp4',
    }),
  )
}

describe('generateVideo previousJobId gate', () => {
  it('throws when the model does not support editing', async () => {
    const adapter = new MockVideoAdapter(undefined)

    await expect(
      generateVideo({
        adapter,
        prompt: 'x',
        previousJobId: 'prior-job',
      }),
    ).rejects.toThrow(/does not support editing previous generations/)
    expect(adapter.createVideoJob).not.toHaveBeenCalled()
  })

  it('throws when previousJobId is empty', async () => {
    const adapter = new MockVideoAdapter('job')

    await expect(
      generateVideo({
        adapter,
        prompt: 'x',
        previousJobId: '',
      }),
    ).rejects.toThrow(/previousJobId is required/)
    expect(adapter.createVideoJob).not.toHaveBeenCalled()
  })

  it('forwards previousJobId to media-kind adapters (URL resolve is adapter-side)', async () => {
    const adapter = new MockVideoAdapter('media')

    await generateVideo({
      adapter,
      prompt: 'x',
      previousJobId: 'prior-job',
    })

    expect(adapter.lastOptions?.previousJobId).toBe('prior-job')
    // Core does not resolve the URL — media adapters call getVideoUrl themselves.
    expect(adapter.getVideoUrl).not.toHaveBeenCalled()
  })

  it('forwards a valid previousJobId to the adapter', async () => {
    const adapter = new MockVideoAdapter('job')

    const result = await generateVideo({
      adapter,
      prompt: 'make it stormy',
      previousJobId: 'prior-job',
    })

    expect(result).toEqual({ jobId: 'job-1', model: 'mock-model' })
    expect(adapter.lastOptions?.previousJobId).toBe('prior-job')
  })

  it('omits previousJobId from adapter options when not provided', async () => {
    const adapter = new MockVideoAdapter('job')

    await generateVideo({ adapter, prompt: 'x' })

    expect(adapter.lastOptions).toBeDefined()
    expect('previousJobId' in adapter.lastOptions!).toBe(false)
  })

  it('gates previousJobId in streaming mode too', async () => {
    const adapter = new MockVideoAdapter(undefined)

    const chunks = []
    for await (const chunk of generateVideo({
      adapter,
      prompt: 'x',
      previousJobId: 'prior-job',
      stream: true,
      pollingInterval: 1,
    })) {
      chunks.push(chunk)
    }

    const errorChunk = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(errorChunk).toBeDefined()
    expect((errorChunk as { message: string }).message).toMatch(
      /does not support editing previous generations/,
    )
    expect(adapter.createVideoJob).not.toHaveBeenCalled()
  })

  it('forwards previousJobId to the adapter in streaming mode', async () => {
    const adapter = new MockVideoAdapter('media')

    for await (const _chunk of generateVideo({
      adapter,
      prompt: 'x',
      previousJobId: 'prior-job',
      stream: true,
      pollingInterval: 1,
    })) {
      // drain
    }

    expect(adapter.lastOptions?.previousJobId).toBe('prior-job')
  })
})

// ===========================
// Compile-time typing
// ===========================

type JobEditAdapter = BaseVideoAdapter<
  'job-model',
  Record<string, unknown>,
  Record<string, any>,
  Record<string, string>,
  { 'job-model': readonly ['image'] },
  Record<string, number>,
  { 'job-model': 'job' }
>

type MediaEditAdapter = BaseVideoAdapter<
  'media-model',
  Record<string, unknown>,
  Record<string, any>,
  Record<string, string>,
  { 'media-model': readonly ['image'] },
  Record<string, number>,
  { 'media-model': 'media' }
>

type NoEditAdapter = BaseVideoAdapter<
  'no-edit-model',
  Record<string, unknown>,
  Record<string, any>,
  Record<string, string>,
  { 'no-edit-model': readonly [] },
  Record<string, number>,
  { 'no-edit-model': undefined }
>

describe('previousJobId per-model typing', () => {
  it('accepts a string job id for every editable model', () => {
    type JobPreviousJobId = NonNullable<
      VideoCreateOptions<JobEditAdapter>['previousJobId']
    >
    type MediaPreviousJobId = NonNullable<
      VideoCreateOptions<MediaEditAdapter>['previousJobId']
    >

    expectTypeOf<JobPreviousJobId>().toEqualTypeOf<string>()
    expectTypeOf<MediaPreviousJobId>().toEqualTypeOf<string>()
  })

  it('rejects previousJobId entirely for non-editing models', () => {
    type NoPreviousJobId = VideoCreateOptions<NoEditAdapter>['previousJobId']
    expectTypeOf<NoPreviousJobId>().toEqualTypeOf<undefined>()
  })
})
