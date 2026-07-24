import { describe, expect, it, vi } from 'vitest'
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
  const mockRemix = vi.fn().mockResolvedValue({ id: 'video-job-remix-1' })
  ;(adapter as unknown as { client: { videos: unknown } }).client = {
    videos: { create: mockCreate, remix: mockRemix },
  }
  return { adapter, mockCreate, mockRemix }
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

  describe('previousJobId (Sora remix)', () => {
    it('reports job-kind edit support', () => {
      const adapter = createOpenaiVideo('sora-2', 'test-api-key')
      expect(adapter.supportedEditKind()).toBe('job')
    })

    it('remixes the source video with the new prompt', async () => {
      const { adapter, mockCreate, mockRemix } = mockedAdapter()

      const result = await adapter.createVideoJob({
        model: 'sora-2',
        prompt: 'Make the sky stormy',
        previousJobId: 'video-job-1',
        logger: testLogger,
      })

      expect(mockRemix).toHaveBeenCalledWith('video-job-1', {
        prompt: 'Make the sky stormy',
      })
      expect(mockCreate).not.toHaveBeenCalled()
      expect(result).toEqual({ jobId: 'video-job-remix-1', model: 'sora-2' })
    })

    it('rejects size and duration options on remix', async () => {
      const { adapter, mockRemix } = mockedAdapter()

      await expect(
        adapter.createVideoJob({
          model: 'sora-2',
          prompt: 'x',
          size: '1280x720',
          previousJobId: 'video-job-1',
          logger: testLogger,
        }),
      ).rejects.toThrow(/inherits the source video's size/)

      await expect(
        adapter.createVideoJob({
          model: 'sora-2',
          prompt: 'x',
          duration: 8,
          previousJobId: 'video-job-1',
          logger: testLogger,
        }),
      ).rejects.toThrow(/inherits the source video's duration/)

      await expect(
        adapter.createVideoJob({
          model: 'sora-2',
          prompt: 'x',
          modelOptions: { seconds: '8' },
          previousJobId: 'video-job-1',
          logger: testLogger,
        }),
      ).rejects.toThrow(/inherits the source video's duration/)
      expect(mockRemix).not.toHaveBeenCalled()
    })

    it('rejects media prompt parts and empty prompts on remix', async () => {
      const { adapter, mockRemix } = mockedAdapter()

      await expect(
        adapter.createVideoJob({
          model: 'sora-2',
          prompt: [
            { type: 'text', content: 'x' },
            {
              type: 'image',
              source: { type: 'data', value: 'aGk=', mimeType: 'image/png' },
            },
          ],
          previousJobId: 'video-job-1',
          logger: testLogger,
        }),
      ).rejects.toThrow(/media prompt parts are not supported/)

      await expect(
        adapter.createVideoJob({
          model: 'sora-2',
          prompt: '',
          previousJobId: 'video-job-1',
          logger: testLogger,
        }),
      ).rejects.toThrow(/requires a text prompt/)
      expect(mockRemix).not.toHaveBeenCalled()
    })
  })
})
