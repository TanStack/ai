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
})
