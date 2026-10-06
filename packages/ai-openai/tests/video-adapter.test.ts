import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { generateVideo } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenAIVideoAdapter, createOpenaiVideo } from '../src/adapters/video'

const testLogger = resolveDebugOption(false)

/**
 * Replace the SDK's `videos` client with a mock. `createVideoJob` reaches the
 * SDK exclusively through `getVideosClient()`, so swapping the `videos`
 * resource is enough; the adapter's own request assembly stays real.
 */
function mockedAdapter() {
  const adapter = createOpenaiVideo('sora-2', 'test-api-key')
  const mockCreate = vi.fn().mockResolvedValue({ id: 'video-job-1' })
  ;(adapter as unknown as { client: { videos: unknown } }).client = {
    videos: { create: mockCreate },
  }
  return { adapter, mockCreate }
}

describe('OpenAI Video Adapter', () => {
  it('creates an adapter with the provided API key', () => {
    const adapter = createOpenaiVideo('sora-2', 'test-api-key')
    expect(adapter).toBeInstanceOf(OpenAIVideoAdapter)
    expect(adapter.name).toBe('openai')
    expect(adapter.model).toBe('sora-2')
  })

  describe('createVideoJob with a multimodal prompt', () => {
    it('uploads a single image part as input_reference with verbatim prompt text', async () => {
      const { adapter, mockCreate } = mockedAdapter()

      const result = await adapter.createVideoJob({
        model: 'sora-2',
        prompt: [
          { type: 'text', content: 'Slow cinematic push-in' },
          {
            type: 'image',
            source: { type: 'data', value: 'aGk=', mimeType: 'image/png' },
          },
        ],
        logger: testLogger,
      })

      expect(mockCreate).toHaveBeenCalledTimes(1)
      const request = mockCreate.mock.calls[0]![0]
      expect(request.model).toBe('sora-2')
      expect(request.prompt).toBe('Slow cinematic push-in')
      expect(request.input_reference).toBeInstanceOf(File)
      expect(result.jobId).toBe('video-job-1')
      expect(result.model).toBe('sora-2')
    })

    it('throws on an HTTP(S) URL input_reference by default instead of buffering it (#907)', async () => {
      const { adapter, mockCreate } = mockedAdapter()

      await expect(
        adapter.createVideoJob({
          model: 'sora-2',
          prompt: [
            { type: 'text', content: 'Slow cinematic push-in' },
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/ref.jpg' },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/allowUrlFetch/)
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('fetches an HTTP(S) URL input_reference when allowUrlFetch is set', async () => {
      const adapter = createOpenaiVideo('sora-2', 'test-api-key', {
        allowUrlFetch: true,
      })
      const mockCreate = vi.fn().mockResolvedValue({ id: 'video-job-2' })
      ;(adapter as unknown as { client: { videos: unknown } }).client = {
        videos: { create: mockCreate },
      }
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(new Uint8Array([104, 105]), {
          headers: { 'content-type': 'image/jpeg' },
        }),
      )
      vi.stubGlobal('fetch', fetchMock)

      try {
        await adapter.createVideoJob({
          model: 'sora-2',
          prompt: [
            { type: 'text', content: 'Slow cinematic push-in' },
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/ref.jpg' },
            },
          ],
          logger: testLogger,
        })
      } finally {
        vi.unstubAllGlobals()
      }

      expect(fetchMock).toHaveBeenCalledWith('https://example.com/ref.jpg')
      expect(mockCreate.mock.calls[0]![0].input_reference).toBeInstanceOf(File)
    })

    it('throws when more than one image part is provided', async () => {
      const { adapter, mockCreate } = mockedAdapter()

      await expect(
        adapter.createVideoJob({
          model: 'sora-2',
          prompt: [
            { type: 'text', content: 'x' },
            {
              type: 'image',
              source: { type: 'data', value: 'aGk=', mimeType: 'image/png' },
            },
            {
              type: 'image',
              source: {
                type: 'data',
                value: 'YnllCg==',
                mimeType: 'image/png',
              },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/at most one input_reference image/)
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('rejects video and audio prompt parts', async () => {
      const { adapter, mockCreate } = mockedAdapter()

      await expect(
        adapter.createVideoJob({
          model: 'sora-2',
          prompt: [
            { type: 'text', content: 'x' },
            {
              type: 'video',
              source: { type: 'url', value: 'https://example.com/v.mp4' },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/video prompt parts/)

      await expect(
        adapter.createVideoJob({
          model: 'sora-2',
          prompt: [
            { type: 'text', content: 'x' },
            {
              type: 'audio',
              source: { type: 'url', value: 'https://example.com/a.mp3' },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/audio prompt parts/)
      expect(mockCreate).not.toHaveBeenCalled()
    })
  })

  describe('duration', () => {
    it.each([8, '8', '8s'] as const)(
      'sends seconds "8" for duration %s',
      async (duration) => {
        const { adapter, mockCreate } = mockedAdapter()
        await adapter.createVideoJob({
          model: 'sora-2',
          prompt: 'A cat walking',
          duration,
          logger: testLogger,
        })
        expect(mockCreate.mock.calls[0]![0].seconds).toBe('8')
      },
    )

    it.each([6, '6s', 'auto'] as const)(
      'rejects duration %s',
      async (duration) => {
        const { adapter, mockCreate } = mockedAdapter()
        await expect(
          adapter.createVideoJob({
            model: 'sora-2',
            prompt: 'A cat walking',
            duration: duration as 8,
            logger: testLogger,
          }),
        ).rejects.toThrow(/not supported/)
        expect(mockCreate).not.toHaveBeenCalled()
      },
    )

    it('snaps to the API string and keeps the earlier tie', () => {
      const adapter = createOpenaiVideo('sora-2', 'test-api-key')
      expect(adapter.availableDurations()).toEqual({
        kind: 'discrete',
        values: ['4', '8', '12'],
      })
      expect(adapter.snapDuration(8)).toBe('8')
      expect(adapter.snapDuration(6)).toBe('4')
      expect(adapter.snapDuration('6s')).toBe('4')
      expect(adapter.snapDuration(7)).toBe('8')
      expect(adapter.snapDuration('auto')).toBeUndefined()
      expectTypeOf(adapter.snapDuration).returns.toEqualTypeOf<
        '4' | '8' | '12' | undefined
      >()
    })

    it('accepts 8, "8", and "8s" and rejects 6, "6s", and "auto"', () => {
      const typeOnly = () => {
        const adapter = createOpenaiVideo('sora-2', 'test-api-key')
        void generateVideo({ adapter, prompt: 'x', duration: 8 })
        void generateVideo({ adapter, prompt: 'x', duration: '8' })
        void generateVideo({ adapter, prompt: 'x', duration: '8s' })
        // @ts-expect-error 6 is not a Sora duration
        void generateVideo({ adapter, prompt: 'x', duration: 6 })
        // @ts-expect-error "6s" is not a Sora duration
        void generateVideo({ adapter, prompt: 'x', duration: '6s' })
        // @ts-expect-error "auto" is not a Sora duration
        void generateVideo({ adapter, prompt: 'x', duration: 'auto' })
      }
      expect(typeOnly).toBeTypeOf('function')
    })
  })

  it('returns the download stream unread when the job has no url', async () => {
    const adapter = createOpenaiVideo('sora-2', 'test-api-key')
    const download = new Response('mp4-bytes', {
      headers: { 'content-type': 'video/mp4' },
    })
    ;(adapter as unknown as { client: { videos: unknown } }).client = {
      videos: {
        retrieve: vi
          .fn()
          .mockResolvedValue({ id: 'job-1', status: 'completed' }),
        downloadContent: vi.fn().mockResolvedValue(download),
      },
    }

    const result = await adapter.getVideo('job-1')

    if (!result.body) throw new Error('expected a stream result')
    expect(download.bodyUsed).toBe(false)
    expect(result.contentType).toBe('video/mp4')
    await expect(new Response(result.body).text()).resolves.toBe('mp4-bytes')
  })

  it('getVideoUrl buffers the download into a data URL when the job has no url', async () => {
    const adapter = createOpenaiVideo('sora-2', 'test-api-key')
    ;(adapter as unknown as { client: { videos: unknown } }).client = {
      videos: {
        retrieve: vi
          .fn()
          .mockResolvedValue({ id: 'job-1', status: 'completed' }),
        downloadContent: vi.fn().mockResolvedValue(
          new Response('mp4-bytes', {
            headers: { 'content-type': 'video/mp4' },
          }),
        ),
      },
    }

    await expect(adapter.getVideoUrl('job-1')).resolves.toEqual({
      jobId: 'job-1',
      url: `data:video/mp4;base64,${btoa('mp4-bytes')}`,
    })
  })
})
