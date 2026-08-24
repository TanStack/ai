import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { LovableVideoAdapter, createLovableVideo } from '../src/adapters/video'
import type OpenAI from 'openai'
import type { LovableVideoModel } from '../src/model-meta'

const testLogger = resolveDebugOption(false)

class TestLovableVideoAdapter<
  TModel extends LovableVideoModel,
> extends LovableVideoAdapter<TModel> {
  spyOnVideosCreate() {
    return vi.spyOn(this.client.videos, 'create')
  }
  spyOnVideosRetrieve() {
    return vi.spyOn(this.client.videos, 'retrieve')
  }
}

function queuedVideo(id: string): OpenAI.Videos.Video {
  return {
    id,
    completed_at: null,
    created_at: 0,
    error: null,
    expires_at: null,
    model: 'sora-2',
    object: 'video',
    progress: 0,
    prompt: null,
    remixed_from_video_id: null,
    seconds: '4',
    size: '1280x720',
    status: 'queued',
  }
}

describe('Lovable video adapter', () => {
  it('creates an adapter with the provided API key', () => {
    const adapter = createLovableVideo('google/veo-3.1-lite', 'test-api-key')
    expect(adapter).toBeInstanceOf(LovableVideoAdapter)
    expect(adapter.name).toBe('lovable')
    expect(adapter.model).toBe('google/veo-3.1-lite')
  })

  it('reports discrete 4, 6, and 8 second durations', () => {
    const adapter = createLovableVideo('google/veo-3.1-lite', 'k')
    expect(adapter.availableDurations()).toEqual({
      kind: 'discrete',
      values: [4, 6, 8],
    })
    expect(adapter.snapDuration(4)).toBe(4)
    expect(adapter.snapDuration(5)).toBe(4)
    expect(adapter.snapDuration(8)).toBe(8)
  })

  it('creates a job with prompt, size, and seconds', async () => {
    const adapter = new TestLovableVideoAdapter(
      { apiKey: 'test-api-key' },
      'google/veo-3.1-lite',
    )
    const mockCreate = adapter
      .spyOnVideosCreate()
      .mockResolvedValueOnce(queuedVideo('video-job-1'))

    const abortSignal = new AbortController().signal
    const result = await adapter.createVideoJob({
      model: 'google/veo-3.1-lite',
      prompt: 'A cat walking through fog',
      size: '1280x720',
      duration: 4,
      logger: testLogger,
      abortSignal,
    })

    expect(result).toEqual({
      jobId: 'video-job-1',
      model: 'google/veo-3.1-lite',
    })
    expect(mockCreate).toHaveBeenCalledWith(
      {
        model: 'google/veo-3.1-lite',
        prompt: 'A cat walking through fog',
        size: '1280x720',
        seconds: '4',
      },
      { signal: abortSignal },
    )
  })

  it('converts expires_at Unix seconds to a Date', async () => {
    const adapter = new TestLovableVideoAdapter(
      { apiKey: 'test-api-key' },
      'google/veo-3.1-lite',
    )
    const expiresAtSeconds = 1_700_000_000
    const completed: OpenAI.Videos.Video & { url: string } = {
      ...queuedVideo('video-job-1'),
      status: 'completed',
      expires_at: expiresAtSeconds,
      url: 'https://cdn.example/clip.mp4',
    }
    adapter.spyOnVideosRetrieve().mockResolvedValueOnce(completed)

    const result = await adapter.getVideoUrl('video-job-1')

    expect(result.url).toBe('https://cdn.example/clip.mp4')
    expect(result.expiresAt).toEqual(new Date(expiresAtSeconds * 1000))
  })

  it('uploads a single image part as input_reference', async () => {
    const adapter = new TestLovableVideoAdapter(
      { apiKey: 'test-api-key' },
      'google/veo-3.1-lite',
    )
    const mockCreate = adapter
      .spyOnVideosCreate()
      .mockResolvedValueOnce(queuedVideo('video-job-1'))

    await adapter.createVideoJob({
      model: 'google/veo-3.1-lite',
      prompt: [
        { type: 'text', content: 'Slow cinematic push-in' },
        {
          type: 'image',
          source: { type: 'data', value: 'aGk=', mimeType: 'image/png' },
        },
      ],
      logger: testLogger,
    })

    const request = mockCreate.mock.calls[0]![0]
    expect(request.prompt).toBe('Slow cinematic push-in')
    expect(request.input_reference).toBeInstanceOf(File)
  })

  it('rejects 4K on Veo 3.1 Lite', async () => {
    const adapter = new TestLovableVideoAdapter(
      { apiKey: 'test-api-key' },
      'google/veo-3.1-lite',
    )
    const mockCreate = adapter.spyOnVideosCreate()

    await expect(
      adapter.createVideoJob({
        model: 'google/veo-3.1-lite',
        prompt: 'A city at night',
        modelOptions: { size: '3840x2160' },
        logger: testLogger,
      }),
    ).rejects.toThrow(/4K/)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('rejects non-8-second clips at 1080p', async () => {
    const adapter = new TestLovableVideoAdapter(
      { apiKey: 'test-api-key' },
      'google/veo-3.1-fast',
    )
    const mockCreate = adapter.spyOnVideosCreate()

    await expect(
      adapter.createVideoJob({
        model: 'google/veo-3.1-fast',
        prompt: 'A city at night',
        size: '1920x1080',
        duration: 4,
        logger: testLogger,
      }),
    ).rejects.toThrow(/8 second/)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('throws when more than one image part is provided', async () => {
    const adapter = new TestLovableVideoAdapter(
      { apiKey: 'test-api-key' },
      'google/veo-3.1-lite',
    )
    const mockCreate = adapter.spyOnVideosCreate()

    await expect(
      adapter.createVideoJob({
        model: 'google/veo-3.1-lite',
        prompt: [
          { type: 'text', content: 'x' },
          {
            type: 'image',
            source: { type: 'data', value: 'aGk=', mimeType: 'image/png' },
          },
          {
            type: 'image',
            source: { type: 'data', value: 'YnllCg==', mimeType: 'image/png' },
          },
        ],
        logger: testLogger,
      }),
    ).rejects.toThrow(/at most one input_reference image/)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
