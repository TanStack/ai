import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createOpenRouterVideo } from '../src/adapters/video'

const testLogger = resolveDebugOption(false)

let mockGenerate = vi.fn()
let mockGetGeneration = vi.fn()
let mockGetVideoContent = vi.fn()

// Mock the OpenRouter SDK
vi.mock('@openrouter/sdk', () => {
  return {
    OpenRouter: class {
      videoGeneration = {
        generate: (...args: Array<unknown>) => mockGenerate(...args),
        getGeneration: (...args: Array<unknown>) => mockGetGeneration(...args),
        getVideoContent: (...args: Array<unknown>) =>
          mockGetVideoContent(...args),
      }
    },
  }
})

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

const createAdapter = () =>
  createOpenRouterVideo('bytedance/seedance-2.0', 'test-key')

function createMockJobResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-123',
    pollingUrl: 'https://openrouter.ai/api/v1/videos/job-123',
    status: 'pending',
    ...overrides,
  }
}

describe('OpenRouter Video Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createVideoJob', () => {
    it('submits a text-to-video request and returns the job id', async () => {
      mockGenerate = vi.fn().mockResolvedValueOnce(createMockJobResponse())

      const adapter = createAdapter()
      const result = await adapter.createVideoJob({
        model: 'bytedance/seedance-2.0',
        prompt: 'A red panda surfing a wave at golden hour',
        logger: testLogger,
      })

      expect(mockGenerate).toHaveBeenCalledTimes(1)
      const request = mockGenerate.mock.calls[0]![0].videoGenerationRequest
      expect(request).toEqual({
        model: 'bytedance/seedance-2.0',
        prompt: 'A red panda surfing a wave at golden hour',
      })
      expect(result).toEqual({
        jobId: 'job-123',
        model: 'bytedance/seedance-2.0',
      })
    })

    it('passes size, duration, and provider options through', async () => {
      mockGenerate = vi.fn().mockResolvedValueOnce(createMockJobResponse())

      const adapter = createAdapter()
      await adapter.createVideoJob({
        model: 'bytedance/seedance-2.0',
        prompt: 'A drone shot over a fjord',
        size: '1280x720',
        duration: 8,
        modelOptions: {
          seed: 42,
          generateAudio: true,
          callbackUrl: 'https://example.com/webhook',
          resolution: '720p',
          aspectRatio: '16:9',
          provider: { options: { openai: { quality: 'high' } } },
        },
        logger: testLogger,
      })

      const request = mockGenerate.mock.calls[0]![0].videoGenerationRequest
      expect(request).toMatchObject({
        model: 'bytedance/seedance-2.0',
        prompt: 'A drone shot over a fjord',
        size: '1280x720',
        duration: 8,
        seed: 42,
        generateAudio: true,
        callbackUrl: 'https://example.com/webhook',
        resolution: '720p',
        aspectRatio: '16:9',
        provider: { options: { openai: { quality: 'high' } } },
      })
    })

    it('throws for a size the model does not support', async () => {
      mockGenerate = vi.fn()

      const adapter = createAdapter()
      await expect(
        adapter.createVideoJob({
          model: 'bytedance/seedance-2.0',
          prompt: 'A timelapse of clouds',
          // @ts-expect-error invalid size — the per-model union rejects it at
          // compile time; this still exercises the runtime guard for JS callers.
          size: '333x333',
          logger: testLogger,
        }),
      ).rejects.toThrow(/does not support size '333x333'/)
      expect(mockGenerate).not.toHaveBeenCalled()
    })

    it('throws for a duration the model does not support', async () => {
      mockGenerate = vi.fn()

      const adapter = createAdapter()
      await expect(
        adapter.createVideoJob({
          model: 'bytedance/seedance-2.0',
          prompt: 'A timelapse of clouds',
          // @ts-expect-error invalid duration — the per-model union rejects it
          // at compile time; this still exercises the runtime guard.
          duration: 99,
          logger: testLogger,
        }),
      ).rejects.toThrow(/does not support duration 99s/)
      expect(mockGenerate).not.toHaveBeenCalled()
    })

    it('maps start_frame / end_frame roles onto frame_images and references onto input_references', async () => {
      mockGenerate = vi.fn().mockResolvedValueOnce(createMockJobResponse())

      const adapter = createAdapter()
      await adapter.createVideoJob({
        model: 'bytedance/seedance-2.0',
        prompt: [
          { type: 'text', content: 'Animate between these two stills' },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/first.png' },
            metadata: { role: 'start_frame' },
          },
          {
            type: 'image',
            source: { type: 'data', value: 'bGFzdA==', mimeType: 'image/png' },
            metadata: { role: 'end_frame' },
          },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/style.png' },
            metadata: { role: 'reference' },
          },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/hero.png' },
            metadata: { role: 'character' },
          },
        ],
        logger: testLogger,
      })

      const request = mockGenerate.mock.calls[0]![0].videoGenerationRequest
      expect(request.prompt).toBe('Animate between these two stills')
      expect(request.frameImages).toEqual([
        {
          type: 'image_url',
          imageUrl: { url: 'https://example.com/first.png' },
          frameType: 'first_frame',
        },
        {
          type: 'image_url',
          imageUrl: { url: 'data:image/png;base64,bGFzdA==' },
          frameType: 'last_frame',
        },
      ])
      expect(request.inputReferences).toEqual([
        {
          type: 'image_url',
          imageUrl: { url: 'https://example.com/style.png' },
        },
        {
          type: 'image_url',
          imageUrl: { url: 'https://example.com/hero.png' },
        },
      ])
    })

    it('treats an unroled image as the start frame', async () => {
      mockGenerate = vi.fn().mockResolvedValueOnce(createMockJobResponse())

      const adapter = createAdapter()
      await adapter.createVideoJob({
        model: 'bytedance/seedance-2.0',
        prompt: [
          { type: 'text', content: 'Bring this photo to life' },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/photo.png' },
          },
        ],
        logger: testLogger,
      })

      const request = mockGenerate.mock.calls[0]![0].videoGenerationRequest
      expect(request.frameImages).toEqual([
        {
          type: 'image_url',
          imageUrl: { url: 'https://example.com/photo.png' },
          frameType: 'first_frame',
        },
      ])
      expect(request.inputReferences).toBeUndefined()
    })

    it('throws when two images compete for the start frame', async () => {
      mockGenerate = vi.fn()

      const adapter = createAdapter()
      await expect(
        adapter.createVideoJob({
          model: 'bytedance/seedance-2.0',
          prompt: [
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/a.png' },
            },
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/b.png' },
              metadata: { role: 'start_frame' },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/at most one start-frame image/)
      expect(mockGenerate).not.toHaveBeenCalled()
    })

    it('throws for mask / control roles (no video routing)', async () => {
      mockGenerate = vi.fn()

      const adapter = createAdapter()
      await expect(
        adapter.createVideoJob({
          model: 'bytedance/seedance-2.0',
          prompt: [
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/mask.png' },
              metadata: { role: 'mask' },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/role === 'mask' is not supported/)
      expect(mockGenerate).not.toHaveBeenCalled()
    })

    it('throws for an end_frame on a model that only supports first_frame', async () => {
      mockGenerate = vi.fn()

      // minimax/hailuo-2.3 reports supported_frame_images: ['first_frame']
      const adapter = createOpenRouterVideo('minimax/hailuo-2.3', 'test-key')
      await expect(
        adapter.createVideoJob({
          model: 'minimax/hailuo-2.3',
          prompt: [
            { type: 'text', content: 'Fade to this still' },
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/last.png' },
              metadata: { role: 'end_frame' },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/does not accept an end-frame image/)
      expect(mockGenerate).not.toHaveBeenCalled()
    })

    it('throws for video / audio prompt parts', async () => {
      mockGenerate = vi.fn()

      const adapter = createAdapter()
      await expect(
        adapter.createVideoJob({
          model: 'bytedance/seedance-2.0',
          prompt: [
            { type: 'text', content: 'Test' },
            {
              type: 'video',
              source: { type: 'url', value: 'https://example.com/v.mp4' },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/does not support video prompt parts/)
      expect(mockGenerate).not.toHaveBeenCalled()
    })

    it('propagates SDK errors without rewrapping', async () => {
      mockGenerate = vi
        .fn()
        .mockRejectedValueOnce(new Error('Payment required'))

      const adapter = createAdapter()
      await expect(
        adapter.createVideoJob({
          model: 'bytedance/seedance-2.0',
          prompt: 'A scene',
          logger: testLogger,
        }),
      ).rejects.toThrowError(new Error('Payment required'))
    })
  })

  describe('getVideoStatus', () => {
    it.each([
      ['pending', 'pending'],
      ['in_progress', 'processing'],
      ['completed', 'completed'],
      ['failed', 'failed'],
      ['cancelled', 'failed'],
      ['expired', 'failed'],
    ] as const)('maps API status %s to %s', async (apiStatus, expected) => {
      mockGetGeneration = vi
        .fn()
        .mockResolvedValueOnce(createMockJobResponse({ status: apiStatus }))

      const adapter = createAdapter()
      const status = await adapter.getVideoStatus('job-123')

      expect(mockGetGeneration).toHaveBeenCalledWith({ jobId: 'job-123' })
      expect(status).toMatchObject({ jobId: 'job-123', status: expected })
    })

    it('surfaces the job error message on failure', async () => {
      mockGetGeneration = vi.fn().mockResolvedValueOnce(
        createMockJobResponse({
          status: 'failed',
          error: 'Content policy violation',
        }),
      )

      const adapter = createAdapter()
      const status = await adapter.getVideoStatus('job-123')

      expect(status).toEqual({
        jobId: 'job-123',
        status: 'failed',
        error: 'Content policy violation',
      })
    })
  })

  describe('getVideoUrl', () => {
    const CONTENT_URL =
      'https://openrouter.ai/api/v1/videos/job-123/content?index=0'

    it('downloads the content into a data URL with gateway-reported cost', async () => {
      mockGetGeneration = vi.fn().mockResolvedValueOnce(
        createMockJobResponse({
          status: 'completed',
          unsignedUrls: [CONTENT_URL],
          usage: { cost: 0.45 },
        }),
      )
      const bytes = new TextEncoder().encode('mp4-bytes')
      mockGetVideoContent = vi.fn().mockResolvedValueOnce(streamOf(bytes))

      const adapter = createAdapter()
      const result = await adapter.getVideoUrl('job-123')

      expect(mockGetVideoContent).toHaveBeenCalledWith({ jobId: 'job-123' })
      expect(result.url).toBe(
        `data:video/mp4;base64,${Buffer.from(bytes).toString('base64')}`,
      )
      expect(result.jobId).toBe('job-123')
      expect(result.usage).toMatchObject({ cost: 0.45 })
    })

    it('omits usage when the job reports no cost', async () => {
      mockGetGeneration = vi.fn().mockResolvedValueOnce(
        createMockJobResponse({
          status: 'completed',
          unsignedUrls: [CONTENT_URL],
        }),
      )
      mockGetVideoContent = vi
        .fn()
        .mockResolvedValueOnce(streamOf(new Uint8Array([1, 2, 3])))

      const adapter = createAdapter()
      const result = await adapter.getVideoUrl('job-123')

      expect(result.usage).toBeUndefined()
    })

    it('throws when the content download fails', async () => {
      mockGetGeneration = vi.fn().mockResolvedValueOnce(
        createMockJobResponse({
          status: 'completed',
          unsignedUrls: [CONTENT_URL],
        }),
      )
      mockGetVideoContent = vi
        .fn()
        .mockRejectedValueOnce(new Error('Unauthorized'))

      const adapter = createAdapter()
      await expect(adapter.getVideoUrl('job-123')).rejects.toThrow(
        /failed to download video content for job job-123: Unauthorized/,
      )
    })

    it('throws when the job failed', async () => {
      mockGetGeneration = vi.fn().mockResolvedValueOnce(
        createMockJobResponse({
          status: 'failed',
          error: 'Provider rejected the prompt',
        }),
      )
      mockGetVideoContent = vi.fn()

      const adapter = createAdapter()
      await expect(adapter.getVideoUrl('job-123')).rejects.toThrow(
        /job-123 failed: Provider rejected the prompt/,
      )
      expect(mockGetVideoContent).not.toHaveBeenCalled()
    })

    it('throws when the job has no downloadable content yet', async () => {
      mockGetGeneration = vi
        .fn()
        .mockResolvedValueOnce(createMockJobResponse({ status: 'in_progress' }))
      mockGetVideoContent = vi.fn()

      const adapter = createAdapter()
      await expect(adapter.getVideoUrl('job-123')).rejects.toThrow(
        /no downloadable content yet/,
      )
      expect(mockGetVideoContent).not.toHaveBeenCalled()
    })
  })

  describe('typed durations', () => {
    it('availableDurations() reports the model discrete duration list', () => {
      const adapter = createAdapter() // bytedance/seedance-2.0 → [4..15]
      expect(adapter.availableDurations()).toEqual({
        kind: 'discrete',
        values: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      })
    })

    it('snapDuration() returns an exact match unchanged', () => {
      const adapter = createAdapter()
      expect(adapter.snapDuration(8)).toBe(8)
    })

    it('snapDuration() snaps to the closest supported value', () => {
      const adapter = createAdapter()
      // 7.4 → 7 (rounds to nearest), 99 → 15 (clamped to max), 1 → 4 (min)
      expect(adapter.snapDuration(7.4)).toBe(7)
      expect(adapter.snapDuration(99)).toBe(15)
      expect(adapter.snapDuration(1)).toBe(4)
    })

    it('snapDuration() picks the nearest of a sparse list', () => {
      const adapter = createOpenRouterVideo('alibaba/wan-2.6', 'test-key') // [5, 10]
      expect(adapter.snapDuration(6)).toBe(5)
      expect(adapter.snapDuration(8)).toBe(10)
    })
  })
})
