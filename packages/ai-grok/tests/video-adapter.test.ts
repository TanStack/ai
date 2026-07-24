import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  GrokVideoAdapter,
  createGrokVideo,
  grokVideo,
} from '../src/adapters/video'
import {
  getGrokVideoDurationOptions,
  parseGrokVideoSize,
  validateVideoSize,
} from '../src/video/video-provider-options'

const testLogger = resolveDebugOption(false)

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * A `vi.fn` fetch stub with the real fetch parameter list, so call
 * assertions (`mock.calls[0]`) are typed as `[input, init?]`.
 */
function mockFetch(handler: () => Response) {
  return vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
    handler(),
  )
}

/**
 * Builds an adapter whose HTTP layer is the provided mock — injected via
 * the adapter config's `fetch` seam, so no globals are touched.
 */
function adapterWithFetch(
  fetchMock: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
) {
  return createGrokVideo('grok-imagine-video-1.5', 'test-api-key', {
    fetch: fetchMock,
  })
}

/**
 * grok-imagine-video-1.5 is image-to-video only, so every request needs a
 * starting-frame image part. This builds a text + image prompt for the
 * request-shape / status / error tests.
 */
function i2vPrompt(text = 'p') {
  return [
    { type: 'text' as const, content: text },
    {
      type: 'image' as const,
      source: { type: 'url' as const, value: 'https://example.com/start.png' },
    },
  ]
}

describe('Grok Video Adapter', () => {
  describe('factories', () => {
    it('creates an adapter with the provided API key', () => {
      const adapter = createGrokVideo('grok-imagine-video-1.5', 'test-api-key')
      expect(adapter).toBeInstanceOf(GrokVideoAdapter)
      expect(adapter.kind).toBe('video')
      expect(adapter.name).toBe('grok')
      expect(adapter.model).toBe('grok-imagine-video-1.5')
    })

    it('grokVideo reads XAI_API_KEY from the environment', () => {
      vi.stubEnv('XAI_API_KEY', 'env-key')
      try {
        const adapter = grokVideo('grok-imagine-video-1.5')
        expect(adapter).toBeInstanceOf(GrokVideoAdapter)
      } finally {
        vi.unstubAllEnvs()
      }
    })
  })

  describe('createVideoJob', () => {
    it('posts a JSON request to the Imagine generations endpoint', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'req-123' }))
      const adapter = adapterWithFetch(fetchMock)

      const result = await adapter.createVideoJob({
        model: 'grok-imagine-video-1.5',
        prompt: i2vPrompt('A red ball bouncing once'),
        size: '16:9_720p',
        duration: 5,
        logger: testLogger,
      })

      expect(result).toEqual({
        jobId: 'req-123',
        model: 'grok-imagine-video-1.5',
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0]!
      expect(url).toBe('https://api.x.ai/v1/videos/generations')
      expect(init?.method).toBe('POST')
      expect(init?.headers).toMatchObject({
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-api-key',
      })
      expect(JSON.parse(String(init?.body))).toEqual({
        model: 'grok-imagine-video-1.5',
        prompt: 'A red ball bouncing once',
        image: { url: 'https://example.com/start.png' },
        aspect_ratio: '16:9',
        resolution: '720p',
        duration: 5,
      })
    })

    it('maps a bare aspect-ratio size without a resolution', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = adapterWithFetch(fetchMock)

      await adapter.createVideoJob({
        model: 'grok-imagine-video-1.5',
        prompt: i2vPrompt(),
        size: '9:16',
        logger: testLogger,
      })

      const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))
      expect(body.aspect_ratio).toBe('9:16')
      expect(body).not.toHaveProperty('resolution')
      expect(body).not.toHaveProperty('duration')
    })

    it('passes modelOptions through', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = adapterWithFetch(fetchMock)

      await adapter.createVideoJob({
        model: 'grok-imagine-video-1.5',
        prompt: i2vPrompt('make the waterfall crash down'),
        modelOptions: {
          resolution: '1080p',
          duration: 10,
        },
        logger: testLogger,
      })

      const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))
      expect(body.prompt).toBe('make the waterfall crash down')
      expect(body.resolution).toBe('1080p')
      expect(body.duration).toBe(10)
    })

    it('maps an image prompt part to the starting frame (image-to-video)', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = adapterWithFetch(fetchMock)

      await adapter.createVideoJob({
        model: 'grok-imagine-video-1.5',
        prompt: [
          { type: 'text', content: 'make the waterfall crash down' },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/still.png' },
          },
        ],
        duration: 10,
        logger: testLogger,
      })

      const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))
      // Prompt text is sent verbatim; the image becomes the starting frame.
      expect(body.prompt).toBe('make the waterfall crash down')
      expect(body.image).toEqual({ url: 'https://example.com/still.png' })
      expect(body.duration).toBe(10)
    })

    it('sends a base64 data source as a data URI starting frame', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = adapterWithFetch(fetchMock)

      await adapter.createVideoJob({
        model: 'grok-imagine-video-1.5',
        prompt: [
          { type: 'text', content: 'pan out slowly' },
          {
            type: 'image',
            source: { type: 'data', mimeType: 'image/png', value: 'AAAA' },
          },
        ],
        logger: testLogger,
      })

      const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))
      expect(body.image).toEqual({ url: 'data:image/png;base64,AAAA' })
    })

    it('rejects more than one image prompt part before calling the API', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = adapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video-1.5',
          prompt: [
            { type: 'text', content: 'p' },
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/a.png' },
            },
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/b.png' },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/at most one starting-frame image/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects video and audio prompt parts before calling the API', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = adapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video-1.5',
          prompt: [
            { type: 'text', content: 'p' },
            {
              type: 'video',
              source: { type: 'url', value: 'https://example.com/clip.mp4' },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/does not support video prompt parts/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects a text-only prompt on 1.5 — image-to-video only', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = adapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video-1.5',
          prompt: 'a red ball bouncing once',
          logger: testLogger,
        }),
      ).rejects.toThrow(/does not support text-to-video/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('allows a text-only prompt on grok-imagine-video (text-to-video)', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'tv-1' }))
      const adapter = createGrokVideo('grok-imagine-video', 'test-api-key', {
        fetch: fetchMock,
      })

      const result = await adapter.createVideoJob({
        model: 'grok-imagine-video',
        prompt: 'A beautiful sunset over the ocean',
        size: '16:9_720p',
        duration: 5,
        logger: testLogger,
      })

      expect(result).toEqual({ jobId: 'tv-1', model: 'grok-imagine-video' })
      const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))
      expect(body.prompt).toBe('A beautiful sunset over the ocean')
      expect(body).not.toHaveProperty('image')
    })

    it('maps a starting frame on grok-imagine-video (image-to-video)', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'iv-1' }))
      const adapter = createGrokVideo('grok-imagine-video', 'test-api-key', {
        fetch: fetchMock,
      })

      await adapter.createVideoJob({
        model: 'grok-imagine-video',
        prompt: i2vPrompt('animate this'),
        logger: testLogger,
      })

      const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))
      expect(body.image).toEqual({ url: 'https://example.com/start.png' })
      expect(body.prompt).toBe('animate this')
    })

    it('lets modelOptions win over the generic size template', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = adapterWithFetch(fetchMock)

      await adapter.createVideoJob({
        model: 'grok-imagine-video-1.5',
        prompt: i2vPrompt(),
        size: '16:9_480p',
        modelOptions: { resolution: '1080p' },
        logger: testLogger,
      })

      const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))
      expect(body.aspect_ratio).toBe('16:9')
      expect(body.resolution).toBe('1080p')
    })

    it('rejects unsupported sizes before calling the API', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = adapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video-1.5',
          prompt: 'p',
          // @ts-expect-error invalid size is also rejected at compile time
          size: '7:5',
          logger: testLogger,
        }),
      ).rejects.toThrow(/Size "7:5" is not supported/)
      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video-1.5',
          prompt: 'p',
          // @ts-expect-error invalid resolution is also rejected at compile time
          size: '16:9_9k',
          logger: testLogger,
        }),
      ).rejects.toThrow(/Resolution "9k" is not supported/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('snaps out-of-range and non-integer durations into the valid range', async () => {
      // [requested, snapped]: clamp to [1, 15], round to whole seconds.
      const cases: Array<[number, number]> = [
        [0, 1],
        [16, 15],
        [2.5, 3],
        [7, 7],
      ]
      for (const [requested, snapped] of cases) {
        const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
        const adapter = adapterWithFetch(fetchMock)
        await adapter.createVideoJob({
          model: 'grok-imagine-video-1.5',
          prompt: i2vPrompt(),
          duration: requested,
          logger: testLogger,
        })
        const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))
        expect(body.duration).toBe(snapped)
      }
    })

    it('snaps a duration supplied via modelOptions', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = adapterWithFetch(fetchMock)

      await adapter.createVideoJob({
        model: 'grok-imagine-video-1.5',
        prompt: i2vPrompt(),
        modelOptions: { duration: 99 },
        logger: testLogger,
      })

      const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))
      expect(body.duration).toBe(15)
    })

    it('surfaces API error messages from the xAI error body', async () => {
      const fetchMock = mockFetch(() =>
        jsonResponse(
          {
            code: 'invalid-argument',
            error: 'Duration must be between 1 and 15 seconds',
          },
          400,
        ),
      )
      const adapter = adapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video-1.5',
          prompt: i2vPrompt(),
          logger: testLogger,
        }),
      ).rejects.toThrow(
        /video generation request failed \(400.*Duration must be between 1 and 15 seconds/,
      )
    })

    it('throws when the response carries no request_id', async () => {
      const fetchMock = mockFetch(() => jsonResponse({}))
      const adapter = adapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video-1.5',
          prompt: i2vPrompt(),
          logger: testLogger,
        }),
      ).rejects.toThrow(/no request_id/)
    })

    it('honours a custom baseURL', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = createGrokVideo('grok-imagine-video-1.5', 'k', {
        baseURL: 'https://proxy.example.com/v1',
        fetch: fetchMock,
      })

      await adapter.createVideoJob({
        model: 'grok-imagine-video-1.5',
        prompt: i2vPrompt(),
        logger: testLogger,
      })

      expect(fetchMock.mock.calls[0]![0]).toBe(
        'https://proxy.example.com/v1/videos/generations',
      )
    })
  })

  describe('getVideoStatus', () => {
    it('maps a pending job with progress', async () => {
      const fetchMock = mockFetch(() =>
        jsonResponse({ status: 'pending', progress: 18 }),
      )
      const adapter = adapterWithFetch(fetchMock)

      const status = await adapter.getVideoStatus('req-123')

      expect(fetchMock.mock.calls[0]![0]).toBe(
        'https://api.x.ai/v1/videos/req-123',
      )
      expect(status).toEqual({
        jobId: 'req-123',
        status: 'pending',
        progress: 18,
      })
    })

    it('maps a done job to completed', async () => {
      const fetchMock = mockFetch(() =>
        jsonResponse({
          status: 'done',
          progress: 100,
          video: { url: 'https://vidgen.x.ai/video.mp4', duration: 5 },
        }),
      )
      const adapter = adapterWithFetch(fetchMock)

      expect(await adapter.getVideoStatus('req-123')).toEqual({
        jobId: 'req-123',
        status: 'completed',
        progress: 100,
      })
    })

    it.each(['failed', 'expired'])('maps %s to failed', async (apiStatus) => {
      const fetchMock = mockFetch(() =>
        jsonResponse({ status: apiStatus, error: 'moderation' }),
      )
      const adapter = adapterWithFetch(fetchMock)

      expect(await adapter.getVideoStatus('req-123')).toEqual({
        jobId: 'req-123',
        status: 'failed',
        error: 'moderation',
      })
    })

    it('maps an unknown in-flight status to processing', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ status: 'generating' }))
      const adapter = adapterWithFetch(fetchMock)

      expect((await adapter.getVideoStatus('req-123')).status).toBe(
        'processing',
      )
    })

    it('reports a 404 as a failed job rather than throwing', async () => {
      const fetchMock = mockFetch(() =>
        jsonResponse(
          { code: 'not-found', error: 'Failed to read static file.' },
          404,
        ),
      )
      const adapter = adapterWithFetch(fetchMock)

      expect(await adapter.getVideoStatus('missing')).toEqual({
        jobId: 'missing',
        status: 'failed',
        error: 'Job not found',
      })
    })

    it('throws on non-404 API errors', async () => {
      const fetchMock = mockFetch(() =>
        jsonResponse({ error: 'server exploded' }, 500),
      )
      const adapter = adapterWithFetch(fetchMock)

      await expect(adapter.getVideoStatus('req-123')).rejects.toThrow(
        /video status request failed \(500/,
      )
    })
  })

  describe('getVideoUrl', () => {
    it('returns the video URL with billed seconds and exact cost', async () => {
      const fetchMock = mockFetch(() =>
        jsonResponse({
          status: 'done',
          progress: 100,
          model: 'grok-imagine-video-1.5',
          video: {
            url: 'https://vidgen.x.ai/video.mp4',
            duration: 5,
          },
          usage: { cost_in_usd_ticks: 2_500_000_000 },
        }),
      )
      const adapter = adapterWithFetch(fetchMock)

      expect(await adapter.getVideoUrl('req-123')).toEqual({
        jobId: 'req-123',
        url: 'https://vidgen.x.ai/video.mp4',
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          unitsBilled: 5,
          cost: 0.25,
        },
      })
    })

    it('omits usage when the response carries none', async () => {
      const fetchMock = mockFetch(() =>
        jsonResponse({
          status: 'done',
          video: { url: 'https://vidgen.x.ai/video.mp4' },
        }),
      )
      const adapter = adapterWithFetch(fetchMock)

      expect(await adapter.getVideoUrl('req-123')).toEqual({
        jobId: 'req-123',
        url: 'https://vidgen.x.ai/video.mp4',
      })
    })

    it('throws when the job is not finished yet', async () => {
      const fetchMock = mockFetch(() =>
        jsonResponse({ status: 'pending', progress: 40 }),
      )
      const adapter = adapterWithFetch(fetchMock)

      await expect(adapter.getVideoUrl('req-123')).rejects.toThrow(
        /not ready for download/,
      )
    })

    it('throws with the provider error when the job failed', async () => {
      const fetchMock = mockFetch(() =>
        jsonResponse({ status: 'failed', error: 'moderation' }),
      )
      const adapter = adapterWithFetch(fetchMock)

      await expect(adapter.getVideoUrl('req-123')).rejects.toThrow(
        /Video generation failed: moderation/,
      )
    })

    it('throws a not-found error for unknown jobs', async () => {
      const fetchMock = mockFetch(() =>
        jsonResponse({ code: 'not-found', error: 'nope' }, 404),
      )
      const adapter = adapterWithFetch(fetchMock)

      await expect(adapter.getVideoUrl('missing')).rejects.toThrow(
        /Video job not found: missing/,
      )
    })
  })

  describe('video provider option helpers', () => {
    it('parses size templates', () => {
      expect(parseGrokVideoSize('16:9_720p')).toEqual({
        aspectRatio: '16:9',
        resolution: '720p',
      })
      expect(parseGrokVideoSize('3:4')).toEqual({ aspectRatio: '3:4' })
      expect(parseGrokVideoSize('not-a-size')).toBeUndefined()
    })

    it('validates sizes', () => {
      expect(() => validateVideoSize('m', '16:9')).not.toThrow()
      expect(() => validateVideoSize('m', '2:3_1080p')).not.toThrow()
      expect(() => validateVideoSize('m', undefined)).not.toThrow()
      expect(() => validateVideoSize('m', '9:19.5')).toThrow(/not supported/)
      expect(() => validateVideoSize('m', 'auto')).toThrow(/not supported/)
      expect(() => validateVideoSize('m', '16:9_2k')).toThrow(/Resolution/)
    })

    it('exposes the 1–15s duration range via getGrokVideoDurationOptions', () => {
      expect(getGrokVideoDurationOptions('grok-imagine-video')).toEqual({
        kind: 'range',
        min: 1,
        max: 15,
        step: 1,
        unit: 'seconds',
      })
      expect(getGrokVideoDurationOptions('grok-imagine-video-1.5')).toEqual({
        kind: 'range',
        min: 1,
        max: 15,
        step: 1,
        unit: 'seconds',
      })
    })

    it('availableDurations / snapDuration coerce raw seconds into range', () => {
      const adapter = createGrokVideo('grok-imagine-video', 'test-api-key')
      expect(adapter.availableDurations()).toEqual({
        kind: 'range',
        min: 1,
        max: 15,
        step: 1,
        unit: 'seconds',
      })
      expect(adapter.snapDuration(0)).toBe(1)
      expect(adapter.snapDuration(16)).toBe(15)
      expect(adapter.snapDuration(2.5)).toBe(3)
      expect(adapter.snapDuration(7)).toBe(7)
    })
  })

  describe('previousJobId (/videos/edits)', () => {
    it('reports media-kind edit support for grok-imagine-video only', () => {
      expect(
        createGrokVideo('grok-imagine-video', 'k').supportedEditKind(),
      ).toBe('media')
      expect(
        createGrokVideo('grok-imagine-video-1.5', 'k').supportedEditKind(),
      ).toBeUndefined()
    })

    it('posts the edit prompt and resolved source URL to /videos/edits', async () => {
      const fetchMock = vi.fn(
        async (input: string | URL | Request, _init?: RequestInit) => {
          const url = String(input)
          if (url.includes('/videos/edits')) {
            return jsonResponse({ request_id: 'edit-req-1' })
          }
          return jsonResponse({
            status: 'done',
            video: { url: 'https://example.com/source.mp4' },
          })
        },
      )
      const adapter = createGrokVideo('grok-imagine-video', 'test-api-key', {
        fetch: fetchMock,
      })

      const result = await adapter.createVideoJob({
        model: 'grok-imagine-video',
        prompt: 'Give the rider a red scarf',
        previousJobId: 'prior-job',
        logger: testLogger,
      })

      expect(result).toEqual({
        jobId: 'edit-req-1',
        model: 'grok-imagine-video',
      })
      expect(String(fetchMock.mock.calls[0]![0])).toContain('/videos/prior-job')
      const [, editInit] = fetchMock.mock.calls[1]!
      expect(String(fetchMock.mock.calls[1]![0])).toContain('/videos/edits')
      expect(JSON.parse(String(editInit?.body))).toEqual({
        model: 'grok-imagine-video',
        prompt: 'Give the rider a red scarf',
        video_url: 'https://example.com/source.mp4',
      })
    })

    it('throws for the image-to-video-only model', async () => {
      const fetchMock = mockFetch(() =>
        jsonResponse({ request_id: 'edit-req-1' }),
      )
      const adapter = adapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video-1.5',
          prompt: 'x',
          previousJobId: 'prior-job',
          logger: testLogger,
        }),
      ).rejects.toThrow(/does not support editing previous generations/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects size/duration options and media parts on edit', async () => {
      const fetchMock = mockFetch(() =>
        jsonResponse({ request_id: 'edit-req-1' }),
      )
      const adapter = createGrokVideo('grok-imagine-video', 'test-api-key', {
        fetch: fetchMock,
      })
      const previousJobId = 'prior-job'

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video',
          prompt: 'x',
          size: '16:9_720p',
          previousJobId,
          logger: testLogger,
        }),
      ).rejects.toThrow(/inherit duration and aspect ratio/)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video',
          prompt: 'x',
          duration: 8,
          previousJobId,
          logger: testLogger,
        }),
      ).rejects.toThrow(/inherit duration and aspect ratio/)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video',
          prompt: 'x',
          modelOptions: { resolution: '720p' },
          previousJobId,
          logger: testLogger,
        }),
      ).rejects.toThrow(/inherit duration and aspect ratio/)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video',
          prompt: i2vPrompt('x'),
          previousJobId,
          logger: testLogger,
        }),
      ).rejects.toThrow(/media prompt parts are not supported/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('surfaces edit endpoint errors with the API message', async () => {
      const fetchMock = vi.fn(
        async (input: string | URL | Request, _init?: RequestInit) => {
          const url = String(input)
          if (url.includes('/videos/edits')) {
            return jsonResponse({ code: 'bad', error: 'video too long' }, 400)
          }
          return jsonResponse({
            status: 'done',
            video: { url: 'https://example.com/source.mp4' },
          })
        },
      )
      const adapter = createGrokVideo('grok-imagine-video', 'test-api-key', {
        fetch: fetchMock,
      })

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video',
          prompt: 'x',
          previousJobId: 'prior-job',
          logger: testLogger,
        }),
      ).rejects.toThrow(/video edit request failed/)
    })
  })
})
