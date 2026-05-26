import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateVideo } from '@tanstack/ai'

import { falVideo } from '../src/adapters/video'

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

    it('includes duration option using the model-typed keyword', async () => {
      mockQueueSubmit.mockResolvedValueOnce({
        request_id: 'job-789',
      })

      const adapter = createAdapter()

      await generateVideo({
        adapter: adapter,
        prompt: 'A time lapse of a sunset',
        // veo3/image-to-video accepts '4s' | '6s' | '8s' — passing a raw
        // number is now a type error.
        duration: '8s',
        modelOptions: {
          image_url: 'https://example.com/sunset.jpg',
        },
      })

      const [, options] = mockQueueSubmit.mock.calls[0]!
      expect(options.input).toMatchObject({
        duration: '8s',
      })
    })

    it('omits duration for kind: none models (Minimax)', async () => {
      mockQueueSubmit.mockResolvedValueOnce({
        request_id: 'job-mini',
      })

      const adapter = falVideo('fal-ai/minimax/video-01', { apiKey: 'test' })

      await generateVideo({
        adapter,
        prompt: 'A fox running through snow',
      })

      const [, options] = mockQueueSubmit.mock.calls[0]!
      expect(options.input).not.toHaveProperty('duration')
    })
  })

  describe('availableDurations / snapDuration', () => {
    it('returns discrete keyword durations for Veo3', () => {
      const adapter = falVideo('fal-ai/veo3', { apiKey: 'test' })
      expect(adapter.availableDurations()).toEqual({
        kind: 'discrete',
        values: ['4s', '6s', '8s'],
      })
      expect(adapter.snapDuration(7)).toBe('6s')
      expect(adapter.snapDuration(9)).toBe('8s')
    })

    it('returns discrete numeric durations for Kling', () => {
      const adapter = falVideo(
        'fal-ai/kling-video/v1.6/standard/text-to-video',
        { apiKey: 'test' },
      )
      expect(adapter.availableDurations()).toEqual({
        kind: 'discrete',
        values: ['5', '10'],
      })
      expect(adapter.snapDuration(7)).toBe('5')
      expect(adapter.snapDuration(8)).toBe('10')
    })

    it('returns kind: none for Minimax (no duration field)', () => {
      const adapter = falVideo('fal-ai/minimax/video-01', { apiKey: 'test' })
      expect(adapter.availableDurations()).toEqual({ kind: 'none' })
      expect(adapter.snapDuration(7)).toBeUndefined()
    })

    it('falls back to kind: none for uncurated models', () => {
      const adapter = falVideo('fal-ai/some-unknown-video-model', {
        apiKey: 'test',
      })
      expect(adapter.availableDurations()).toEqual({ kind: 'none' })
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
  })

  describe('client configuration', () => {
    it('configures client with API key', () => {
      falVideo('fal-ai/veo3/image-to-video', { apiKey: 'my-api-key' })

      expect(mockConfig).toHaveBeenCalledWith({
        credentials: 'my-api-key',
      })
    })

    it('configures client with proxy URL and credentials when both provided', () => {
      falVideo('fal-ai/veo3/image-to-video', {
        apiKey: 'my-api-key',
        proxyUrl: '/api/fal/proxy',
      })

      expect(mockConfig).toHaveBeenCalledWith({
        credentials: 'my-api-key',
        proxyUrl: '/api/fal/proxy',
      })
    })
  })
})
