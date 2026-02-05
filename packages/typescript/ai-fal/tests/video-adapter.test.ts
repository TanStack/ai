import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFalVideo } from '../src/adapters/video'

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
  createFalVideo('fal-ai/veo3/image-to-video', { apiKey: 'test-key' })

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

      const result = await adapter.createVideoJob({
        model: 'fal-ai/veo3/image-to-video',
        prompt: 'A cat walking in the garden',
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

      await adapter.createVideoJob({
        model: 'fal-ai/veo3/image-to-video',
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

      await adapter.createVideoJob({
        model: 'fal-ai/veo3/image-to-video',
        prompt: 'A time lapse of a sunset',
        duration: 10,
      })

      const [, options] = mockQueueSubmit.mock.calls[0]!
      expect(options.input).toMatchObject({
        duration: 10,
      })
    })

    it('converts size to resolution and aspect ratio', async () => {
      mockQueueSubmit.mockResolvedValueOnce({
        request_id: 'job-ar',
      })

      const adapter = createAdapter()

      await adapter.createVideoJob({
        model: 'fal-ai/veo3/image-to-video',
        prompt: 'A wide landscape video',
        size: '1920x1080', // 1080p, 16:9
      })

      const [, options] = mockQueueSubmit.mock.calls[0]!
      expect(options.input).toMatchObject({
        resolution: '1080p',
        aspect_ratio: '16:9',
      })
    })

    it('passes model-specific options', async () => {
      mockQueueSubmit.mockResolvedValueOnce({
        request_id: 'job-opts',
      })

      const adapter = createAdapter()

      await adapter.createVideoJob({
        model: 'fal-ai/veo3/image-to-video',
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
      createFalVideo('fal-ai/veo3/image-to-video', { apiKey: 'my-api-key' })

      expect(mockConfig).toHaveBeenCalledWith({
        credentials: 'my-api-key',
      })
    })

    it('configures client with proxy URL when provided', () => {
      createFalVideo('fal-ai/veo3/image-to-video', {
        apiKey: 'my-api-key',
        proxyUrl: '/api/fal/proxy',
      })

      expect(mockConfig).toHaveBeenCalledWith({
        proxyUrl: '/api/fal/proxy',
      })
    })
  })
})
