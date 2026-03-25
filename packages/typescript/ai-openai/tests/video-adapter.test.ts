import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOpenaiVideo } from '../src/adapters/video'

describe('OpenAI video adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the configured baseURL for content fallback fetches', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(Uint8Array.from([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        }),
      )

    const adapter = createOpenaiVideo('sora-2', 'test-api-key', {
      baseURL: 'https://example.test/v1',
    })
    ;(adapter as unknown as { client: { videos: { retrieve: (jobId: string) => Promise<unknown> } } }).client =
      {
        videos: {
          retrieve: vi.fn().mockResolvedValue({}),
        },
      }

    const result = await adapter.getVideoUrl('video_123')

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.test/v1/videos/video_123/content',
      {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-api-key',
        },
      },
    )
    expect(result.jobId).toBe('video_123')
    expect(result.url).toMatch(/^data:video\/mp4;base64,/)
  })

  it('maps request options into create payloads', async () => {
    const create = vi.fn().mockResolvedValueOnce({ id: 'video_123' })

    const adapter = createOpenaiVideo('sora-2', 'test-api-key')
    ;(adapter as unknown as { client: { videos: { create: unknown } } }).client =
      {
        videos: {
          create,
        },
      }

    const result = await adapter.createVideoJob({
      model: 'sora-2',
      prompt: 'A calm lake at sunrise',
      duration: 8,
      modelOptions: {
        size: '720x1280',
        seconds: '4',
      },
    })

    expect(create).toHaveBeenCalledWith({
      model: 'sora-2',
      prompt: 'A calm lake at sunrise',
      size: '720x1280',
      seconds: '8',
    })
    expect(result).toEqual({
      jobId: 'video_123',
      model: 'sora-2',
    })
  })
})
