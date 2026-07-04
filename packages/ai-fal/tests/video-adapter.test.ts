import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateVideo } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'

import { falVideo } from '../src/adapters/video'
import { recordBillableUnitsFromResponse } from '../src/utils/billing'
import type { FalVideoProviderOptions } from '../src/model-meta'

function seedBillableUnits(requestId: string, units: string) {
  recordBillableUnitsFromResponse(
    new Response(null, {
      headers: {
        'x-fal-request-id': requestId,
        'x-fal-billable-units': units,
      },
    }),
  )
}

const testLogger = resolveDebugOption(false)

// Compile-time: the kling i2v endpoint declares `image_url` as a REQUIRED
// input, but it's demoted to optional in provider options because the start
// frame usually arrives as a prompt part instead of modelOptions.
const emptyI2vOptions: FalVideoProviderOptions<'fal-ai/kling-video/v3/pro/image-to-video'> =
  {}
void emptyI2vOptions

// Declare mocks at module level
let mockQueueSubmit: any
let mockQueueStatus: any
let mockQueueResult: any
let mockConfig: any

// Mock the fal.ai client
vi.mock('@fal-ai/client', () => {
  return {
    fal: {
      queue: {
        submit: (...args: Array<unknown>) => mockQueueSubmit(...args),
        status: (...args: Array<unknown>) => mockQueueStatus(...args),
        result: (...args: Array<unknown>) => mockQueueResult(...args),
      },
      config: (...args: Array<unknown>) => mockConfig(...args),
    },
  }
})

const createAdapter = () =>
  falVideo('fal-ai/veo3/image-to-video', { apiKey: 'test-key' })

describe('Fal Video Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueueSubmit = vi.fn()
    mockQueueStatus = vi.fn()
    mockQueueResult = vi.fn()
    mockConfig = vi.fn()
  })

  describe('createVideoJob', () => {
    it('submits video generation job to queue', async () => {
      mockQueueSubmit.mockResolvedValueOnce({
        request_id: 'job-123',
      })

      const adapter = createAdapter()

      const result = await generateVideo({
        adapter: adapter,
        prompt: 'A cat walking in the garden',
        modelOptions: {
          image_url: 'https://example.com/cat.jpg',
        },
      })

      expect(mockQueueSubmit).toHaveBeenCalledTimes(1)

      const [model, options] = mockQueueSubmit.mock.calls[0]!
      expect(model).toBe('fal-ai/veo3/image-to-video')
      expect(options).toMatchObject({
        input: {
          prompt: 'A cat walking in the garden',
        },
      })

      expect(result.jobId).toBe('job-123')
      expect(result.model).toBe('fal-ai/veo3/image-to-video')
    })

    it('includes image URL for image-to-video models', async () => {
      mockQueueSubmit.mockResolvedValueOnce({
        request_id: 'job-456',
      })

      const adapter = createAdapter()

      await generateVideo({
        adapter: adapter,
        prompt: 'A stylish woman walks down a Tokyo street',
        modelOptions: {
          image_url: 'https://example.com/image.jpg',
        },
      })

      const [, options] = mockQueueSubmit.mock.calls[0]!
      expect(options.input).toMatchObject({
        image_url: 'https://example.com/image.jpg',
      })
    })

    it('includes duration option', async () => {
      mockQueueSubmit.mockResolvedValueOnce({
        request_id: 'job-789',
      })

      const adapter = createAdapter()

      await generateVideo({
        adapter: adapter,
        prompt: 'A time lapse of a sunset',
        duration: 10,
        modelOptions: {
          image_url: 'https://example.com/sunset.jpg',
        },
      })

      const [, options] = mockQueueSubmit.mock.calls[0]!
      expect(options.input).toMatchObject({
        duration: 10,
      })
    })

    it('converts size with aspect_ratio and resolution', async () => {
      mockQueueSubmit.mockResolvedValueOnce({
        request_id: 'job-ar',
      })

      const adapter = createAdapter()

      await generateVideo({
        adapter: adapter,
        prompt: 'A wide landscape video',
        size: '16:9_720p',
        modelOptions: {
          image_url: 'https://example.com/landscape.jpg',
        },
      })

      const [, options] = mockQueueSubmit.mock.calls[0]!
      expect(options.input).toMatchObject({
        resolution: '720p',
        aspect_ratio: '16:9',
      })
    })
    it('passes model-specific options', async () => {
      mockQueueSubmit.mockResolvedValueOnce({
        request_id: 'job-opts',
      })

      const adapter = createAdapter()

      await generateVideo({
        adapter: adapter,
        prompt: 'Test video',
        modelOptions: {
          image_url: 'https://example.com/image.jpg',
          auto_fix: true,
        },
      })

      const [, options] = mockQueueSubmit.mock.calls[0]!
      expect(options.input).toMatchObject({
        image_url: 'https://example.com/image.jpg',
        auto_fix: true,
      })
    })
  })

  describe('createVideoJob with a multimodal prompt', () => {
    it('maps prompt media parts onto fal input fields', async () => {
      mockQueueSubmit.mockResolvedValueOnce({ request_id: 'job-mm' })

      const adapter = createAdapter()

      await adapter.createVideoJob({
        model: 'fal-ai/veo3/image-to-video',
        prompt: [
          { type: 'text', content: 'Slow cinematic push-in' },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/start.png' },
          },
          {
            type: 'video',
            source: { type: 'url', value: 'https://example.com/ref.mp4' },
            metadata: { role: 'reference' },
          },
          {
            type: 'audio',
            source: { type: 'url', value: 'https://example.com/voice.mp3' },
          },
        ],
        logger: testLogger,
      })

      const [, options] = mockQueueSubmit.mock.calls[0]!
      expect(options.input).toEqual({
        prompt: 'Slow cinematic push-in',
        image_url: 'https://example.com/start.png',
        reference_video_urls: ['https://example.com/ref.mp4'],
        audio_url: 'https://example.com/voice.mp3',
      })
    })

    it('omits the prompt field for media-only prompts', async () => {
      mockQueueSubmit.mockResolvedValueOnce({ request_id: 'job-i2v' })

      const adapter = createAdapter()

      await adapter.createVideoJob({
        model: 'fal-ai/veo3/image-to-video',
        prompt: [
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/start.png' },
          },
        ],
        logger: testLogger,
      })

      const [, options] = mockQueueSubmit.mock.calls[0]!
      expect(options.input).toEqual({
        image_url: 'https://example.com/start.png',
      })
    })

    it('throws when more than one audio prompt part is provided', async () => {
      const adapter = createAdapter()

      await expect(
        adapter.createVideoJob({
          model: 'fal-ai/veo3/image-to-video',
          prompt: [
            { type: 'text', content: 'x' },
            {
              type: 'audio',
              source: { type: 'url', value: 'https://example.com/a.mp3' },
            },
            {
              type: 'audio',
              source: { type: 'url', value: 'https://example.com/b.mp3' },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/exactly one audio prompt part/)
      expect(mockQueueSubmit).not.toHaveBeenCalled()
    })
  })

  describe('getVideoStatus', () => {
    it('returns pending status for queued jobs', async () => {
      mockQueueStatus.mockResolvedValueOnce({
        status: 'IN_QUEUE',
        queue_position: 5,
      })

      const adapter = createAdapter()

      const result = await adapter.getVideoStatus('job-123')

      expect(mockQueueStatus).toHaveBeenCalledWith(
        'fal-ai/veo3/image-to-video',
        { requestId: 'job-123', logs: true },
      )

      expect(result.jobId).toBe('job-123')
      expect(result.status).toBe('pending')
      expect(result.progress).toBe(50) // 100 - 5 * 10 = 50
    })

    it('returns processing status for in-progress jobs', async () => {
      mockQueueStatus.mockResolvedValueOnce({
        status: 'IN_PROGRESS',
        logs: [{ message: 'Generating frames...' }],
      })

      const adapter = createAdapter()

      const result = await adapter.getVideoStatus('job-456')

      expect(result.status).toBe('processing')
    })

    it('returns completed status for finished jobs', async () => {
      mockQueueStatus.mockResolvedValueOnce({
        status: 'COMPLETED',
      })

      const adapter = createAdapter()

      const result = await adapter.getVideoStatus('job-789')

      expect(result.status).toBe('completed')
    })

    it('returns processing for unknown statuses', async () => {
      mockQueueStatus.mockResolvedValueOnce({
        status: 'UNKNOWN_STATUS',
      })

      const adapter = createAdapter()

      const result = await adapter.getVideoStatus('job-unknown')

      expect(result.status).toBe('processing')
    })
  })

  describe('getVideoUrl', () => {
    it('returns video URL from video object', async () => {
      mockQueueResult.mockResolvedValueOnce({
        data: {
          video: { url: 'https://fal.media/files/video.mp4' },
        },
      })

      const adapter = createAdapter()

      const result = await adapter.getVideoUrl('job-123')

      expect(mockQueueResult).toHaveBeenCalledWith(
        'fal-ai/veo3/image-to-video',
        { requestId: 'job-123' },
      )

      expect(result.jobId).toBe('job-123')
      expect(result.url).toBe('https://fal.media/files/video.mp4')
    })

    it('returns video URL from video_url field', async () => {
      mockQueueResult.mockResolvedValueOnce({
        data: {
          video_url: 'https://fal.media/files/video2.mp4',
        },
      })

      const adapter = createAdapter()

      const result = await adapter.getVideoUrl('job-456')

      expect(result.url).toBe('https://fal.media/files/video2.mp4')
    })

    it('throws detailed error when result fetch returns validation error', async () => {
      mockQueueResult.mockRejectedValueOnce({
        name: 'ValidationError',
        status: 422,
        message: 'Unprocessable Entity',
        body: {
          detail: [
            {
              type: 'string_too_long',
              loc: ['body', 'prompt'],
              msg: 'String should have at most 2500 characters',
            },
          ],
        },
      })

      const adapter = createAdapter()

      await expect(adapter.getVideoUrl('job-failed')).rejects.toThrow(
        'Video generation failed: body.prompt: String should have at most 2500 characters',
      )
    })

    it('throws error when video URL is not found', async () => {
      mockQueueResult.mockResolvedValueOnce({
        data: {},
      })

      const adapter = createAdapter()

      await expect(adapter.getVideoUrl('job-789')).rejects.toThrow(
        'Video URL not found in response',
      )
    })

    it('surfaces fal billable units as usage', async () => {
      seedBillableUnits('job-billed', '12')
      mockQueueResult.mockResolvedValueOnce({
        data: {
          video: { url: 'https://fal.media/files/billed.mp4' },
        },
        requestId: 'job-billed',
      })

      const result = await createAdapter().getVideoUrl('job-billed')

      expect(result.url).toBe('https://fal.media/files/billed.mp4')
      expect(result.usage).toEqual({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        billed: { quantity: 12, unit: 'units' },
        unitsBilled: 12,
      })
    })

    it('omits usage when fal does not report billable units', async () => {
      mockQueueResult.mockResolvedValueOnce({
        data: {
          video: { url: 'https://fal.media/files/unbilled.mp4' },
        },
        requestId: 'job-unbilled',
      })

      const result = await createAdapter().getVideoUrl('job-unbilled')

      expect(result.usage).toBeUndefined()
    })
  })

  describe('client configuration', () => {
    it('configures client with API key', () => {
      falVideo('fal-ai/veo3/image-to-video', { apiKey: 'my-api-key' })

      expect(mockConfig).toHaveBeenCalledWith({
        credentials: 'my-api-key',
        fetch: expect.any(Function),
      })
    })

    it('configures client with proxy URL and credentials when both provided', () => {
      falVideo('fal-ai/veo3/image-to-video', {
        apiKey: 'my-api-key',
        proxyUrl: '/api/fal/proxy',
      })

      expect(mockConfig).toHaveBeenCalledWith({
        credentials: 'my-api-key',
        fetch: expect.any(Function),
        proxyUrl: '/api/fal/proxy',
      })
    })
  })
})
