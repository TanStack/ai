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

function sourceAdapterWithFetch(
  fetchMock: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
) {
  return createGrokVideo('grok-imagine-video', 'test-api-key', {
    fetch: fetchMock,
  })
}

/**
 * Builds a text + starting-frame-image prompt for the request-shape /
 * status / error tests.
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

    it('rejects audio prompt parts before calling the API', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = adapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video-1.5',
          prompt: [
            { type: 'text', content: 'p' },
            {
              type: 'audio',
              source: { type: 'url', value: 'https://example.com/voice.mp3' },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/does not support audio prompt parts/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('allows a text-only prompt on 1.5 (text-to-video, native 1080p)', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'tv-15' }))
      const adapter = adapterWithFetch(fetchMock)

      const result = await adapter.createVideoJob({
        model: 'grok-imagine-video-1.5',
        prompt: 'a red ball bouncing once',
        size: '16:9_1080p',
        logger: testLogger,
      })

      expect(result).toEqual({
        jobId: 'tv-15',
        model: 'grok-imagine-video-1.5',
      })
      const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))
      expect(body.prompt).toBe('a red ball bouncing once')
      expect(body.aspect_ratio).toBe('16:9')
      expect(body.resolution).toBe('1080p')
      expect(body).not.toHaveProperty('image')
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

    it('rejects 1080p on grok-imagine-video (v1.0)', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = sourceAdapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video',
          prompt: 'p',
          // Native 1080p is 1.5-only; the v1 size map excludes the suffix.
          // @ts-expect-error 1080p is not a grok-imagine-video size
          size: '16:9_1080p',
          logger: testLogger,
        }),
      ).rejects.toThrow(/1080p/)
      expect(fetchMock).not.toHaveBeenCalled()
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
        /\/videos\/generations request failed \(400.*Duration must be between 1 and 15 seconds/,
      )
    })

    it('strips a JSON-null duration instead of sending it', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = adapterWithFetch(fetchMock)

      await adapter.createVideoJob({
        model: 'grok-imagine-video-1.5',
        prompt: i2vPrompt(),
        // Serializers commonly encode "unset" as null; it must read as
        // absent, not go on the wire as `"duration": null`.
        // @ts-expect-error runtime handling of a JSON-null option
        modelOptions: { duration: null },
        logger: testLogger,
      })

      const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))
      expect(body).not.toHaveProperty('duration')
    })

    it('treats null / empty reference fields as unset', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))

      // Empty array on 1.5: nothing sent.
      const adapter15 = adapterWithFetch(fetchMock)
      await adapter15.createVideoJob({
        model: 'grok-imagine-video-1.5',
        prompt: 'p',
        modelOptions: { reference_audios: [] },
        logger: testLogger,
      })
      let body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))
      expect(body).not.toHaveProperty('reference_audios')

      // JSON-null on v1.0: reads as unset — no reference-gate throw, no
      // field on the wire.
      const adapter10 = createGrokVideo('grok-imagine-video', 'test-api-key', {
        fetch: fetchMock,
      })
      await adapter10.createVideoJob({
        model: 'grok-imagine-video',
        prompt: 'p',
        // @ts-expect-error runtime handling of a JSON-null option
        modelOptions: { reference_images: null },
        logger: testLogger,
      })
      body = JSON.parse(String(fetchMock.mock.calls[1]![1]?.body))
      expect(body).not.toHaveProperty('reference_images')
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

  describe('reference-to-video', () => {
    it('maps role:reference image parts to reference_images', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'ref-1' }))
      const adapter = adapterWithFetch(fetchMock)

      await adapter.createVideoJob({
        model: 'grok-imagine-video-1.5',
        prompt: [
          { type: 'text', content: '<IMAGE_0> walks past <IMAGE_1>' },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/person.png' },
            metadata: { role: 'reference' },
          },
          {
            type: 'image',
            source: { type: 'data', mimeType: 'image/png', value: 'BBBB' },
            metadata: { role: 'character' },
          },
        ],
        size: '16:9_720p',
        logger: testLogger,
      })

      const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))
      expect(body.reference_images).toEqual([
        { url: 'https://example.com/person.png' },
        { url: 'data:image/png;base64,BBBB' },
      ])
      expect(body).not.toHaveProperty('image')
    })

    it('passes reference_audios voice ids through', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'ref-2' }))
      const adapter = adapterWithFetch(fetchMock)

      await adapter.createVideoJob({
        model: 'grok-imagine-video-1.5',
        prompt: '<AUDIO_0> narrates a sunrise',
        modelOptions: { reference_audios: [{ voice_id: 'eve' }] },
        logger: testLogger,
      })

      const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))
      expect(body.reference_audios).toEqual([{ voice_id: 'eve' }])
    })

    it('rejects more than 7 reference images before calling the API', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = adapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video-1.5',
          prompt: 'p',
          modelOptions: {
            reference_images: Array.from({ length: 8 }, (_, i) => ({
              url: `https://example.com/${i}.png`,
            })),
          },
          logger: testLogger,
        }),
      ).rejects.toThrow(/at most 7 reference images/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects more than 3 reference voices before calling the API', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = adapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video-1.5',
          prompt: 'p',
          modelOptions: {
            reference_audios: [
              { voice_id: 'eve' },
              { voice_id: 'ara' },
              { voice_id: 'rex' },
              { voice_id: 'sal' },
            ],
          },
          logger: testLogger,
        }),
      ).rejects.toThrow(/at most 3 reference voices/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects combining a starting frame with reference images', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = adapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video-1.5',
          prompt: [
            { type: 'text', content: '<IMAGE_0> enters from the left' },
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/start.png' },
              metadata: { role: 'start_frame' },
            },
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/person.png' },
              metadata: { role: 'reference' },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/cannot be combined/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects combining a starting frame with reference_audios', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = adapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video-1.5',
          prompt: i2vPrompt('<AUDIO_0> narrates'),
          modelOptions: { reference_audios: [{ voice_id: 'eve' }] },
          logger: testLogger,
        }),
      ).rejects.toThrow(/cannot be combined/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects 1080p on reference-to-video', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = adapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video-1.5',
          prompt: [
            { type: 'text', content: '<IMAGE_0> walks' },
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/person.png' },
              metadata: { role: 'reference' },
            },
          ],
          size: '16:9_1080p',
          logger: testLogger,
        }),
      ).rejects.toThrow(/capped at 720p/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('lets explicit modelOptions.reference_images replace the part-derived list', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'ref-4' }))
      const adapter = adapterWithFetch(fetchMock)

      await adapter.createVideoJob({
        model: 'grok-imagine-video-1.5',
        prompt: [
          { type: 'text', content: 'p' },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/from-part.png' },
            metadata: { role: 'reference' },
          },
        ],
        modelOptions: {
          reference_images: [{ url: 'https://example.com/explicit.png' }],
        },
        logger: testLogger,
      })

      const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))
      expect(body.reference_images).toEqual([
        { url: 'https://example.com/explicit.png' },
      ])
    })

    it('rejects reference inputs on grok-imagine-video (v1.0)', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = createGrokVideo('grok-imagine-video', 'test-api-key', {
        fetch: fetchMock,
      })

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video',
          prompt: [
            { type: 'text', content: 'p' },
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/a.png' },
              metadata: { role: 'reference' },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/does not support reference-to-video inputs/)
      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video',
          prompt: 'p',
          modelOptions: {
            // The per-model options map hides the reference fields from
            // v1.0 at compile time; the runtime gate covers JSON callers.
            // @ts-expect-error reference_audios is 1.5-only
            reference_audios: [{ voice_id: 'eve' }],
          },
          logger: testLogger,
        }),
      ).rejects.toThrow(/does not support reference-to-video inputs/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects an unknown image metadata.role before calling the API', async () => {
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
              // Roles arrive untrusted from JSON callers; an unrecognised
              // value must throw, not silently drop the part.
              // @ts-expect-error runtime validation of a non-MediaInputRole string
              metadata: { role: 'first_frame' },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/unknown image metadata\.role 'first_frame'/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects mask / control / end_frame image roles', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = adapterWithFetch(fetchMock)

      for (const role of ['mask', 'control', 'end_frame'] as const) {
        await expect(
          adapter.createVideoJob({
            model: 'grok-imagine-video-1.5',
            prompt: [
              { type: 'text', content: 'p' },
              {
                type: 'image',
                source: { type: 'url', value: 'https://example.com/a.png' },
                metadata: { role },
              },
            ],
            logger: testLogger,
          }),
        ).rejects.toThrow(new RegExp(`has no '${role}' image`))
      }
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('edit and extend modes', () => {
    const sourceVideoPart = {
      type: 'video' as const,
      source: { type: 'url' as const, value: 'https://example.com/clip.mp4' },
    }

    it("posts to /videos/edits in 'edit' mode with the source video", async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'edit-1' }))
      const adapter = sourceAdapterWithFetch(fetchMock)

      const result = await adapter.createVideoJob({
        model: 'grok-imagine-video',
        prompt: [
          { type: 'text', content: 'make the sky stormy' },
          sourceVideoPart,
        ],
        modelOptions: { mode: 'edit' },
        logger: testLogger,
      })

      expect(result).toEqual({
        jobId: 'edit-1',
        model: 'grok-imagine-video',
      })
      const [url, init] = fetchMock.mock.calls[0]!
      expect(url).toBe('https://api.x.ai/v1/videos/edits')
      expect(JSON.parse(String(init?.body))).toEqual({
        model: 'grok-imagine-video',
        prompt: 'make the sky stormy',
        video: { url: 'https://example.com/clip.mp4' },
      })
    })

    it("posts to /videos/extensions in 'extend' mode with the added-tail duration", async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'ext-1' }))
      const adapter = sourceAdapterWithFetch(fetchMock)

      await adapter.createVideoJob({
        model: 'grok-imagine-video',
        prompt: [
          { type: 'text', content: 'the camera keeps panning right' },
          sourceVideoPart,
        ],
        duration: 5,
        modelOptions: { mode: 'extend' },
        logger: testLogger,
      })

      const [url, init] = fetchMock.mock.calls[0]!
      expect(url).toBe('https://api.x.ai/v1/videos/extensions')
      expect(JSON.parse(String(init?.body))).toEqual({
        model: 'grok-imagine-video',
        prompt: 'the camera keeps panning right',
        video: { url: 'https://example.com/clip.mp4' },
        duration: 5,
      })
    })

    it('sends a base64 data source as a data URI source video', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = sourceAdapterWithFetch(fetchMock)

      await adapter.createVideoJob({
        model: 'grok-imagine-video',
        prompt: [
          { type: 'text', content: 'p' },
          {
            type: 'video',
            source: { type: 'data', mimeType: 'video/mp4', value: 'CCCC' },
          },
        ],
        modelOptions: { mode: 'edit' },
        logger: testLogger,
      })

      const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))
      expect(body.video).toEqual({ url: 'data:video/mp4;base64,CCCC' })
    })

    it('snaps the extend duration passed via modelOptions', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'ext-2' }))
      const adapter = sourceAdapterWithFetch(fetchMock)

      await adapter.createVideoJob({
        model: 'grok-imagine-video',
        prompt: [{ type: 'text', content: 'keep going' }, sourceVideoPart],
        modelOptions: { mode: 'extend', duration: 2.6 },
        logger: testLogger,
      })

      const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))
      expect(body.duration).toBe(3)
    })

    it('snaps an out-of-range generic extend duration', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'ext-3' }))
      const adapter = sourceAdapterWithFetch(fetchMock)

      await adapter.createVideoJob({
        model: 'grok-imagine-video',
        prompt: [{ type: 'text', content: 'keep going' }, sourceVideoPart],
        duration: 20,
        modelOptions: { mode: 'extend' },
        logger: testLogger,
      })

      const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))
      expect(body.duration).toBe(15)
    })

    it("rejects a duration in 'edit' mode — inherited from the source", async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = sourceAdapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video',
          prompt: [{ type: 'text', content: 'p' }, sourceVideoPart],
          duration: 5,
          modelOptions: { mode: 'edit' },
          logger: testLogger,
        }),
      ).rejects.toThrow(/'edit' mode does not accept a duration/)
      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video',
          prompt: [{ type: 'text', content: 'p' }, sourceVideoPart],
          modelOptions: { mode: 'edit', duration: 99 },
          logger: testLogger,
        }),
      ).rejects.toThrow(/'edit' mode does not accept a duration/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects size / aspect_ratio / resolution in edit and extend modes', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = sourceAdapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video',
          prompt: [{ type: 'text', content: 'p' }, sourceVideoPart],
          size: '16:9_720p',
          modelOptions: { mode: 'edit' },
          logger: testLogger,
        }),
      ).rejects.toThrow(/does not accept size \/ aspect_ratio \/ resolution/)
      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video',
          prompt: [{ type: 'text', content: 'p' }, sourceVideoPart],
          modelOptions: { mode: 'extend', aspect_ratio: '9:16' },
          logger: testLogger,
        }),
      ).rejects.toThrow(/does not accept size \/ aspect_ratio \/ resolution/)
      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video',
          prompt: [{ type: 'text', content: 'p' }, sourceVideoPart],
          modelOptions: { mode: 'edit', resolution: '720p' },
          logger: testLogger,
        }),
      ).rejects.toThrow(/does not accept size \/ aspect_ratio \/ resolution/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('names the edit endpoint in failure messages', async () => {
      const fetchMock = mockFetch(() =>
        jsonResponse({ code: 'invalid-argument', error: 'bad clip' }, 400),
      )
      const adapter = createGrokVideo('grok-imagine-video', 'test-api-key', {
        fetch: fetchMock,
      })

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video',
          prompt: [{ type: 'text', content: 'p' }, sourceVideoPart],
          modelOptions: { mode: 'edit' },
          logger: testLogger,
        }),
      ).rejects.toThrow(/\/videos\/edits request failed \(400.*bad clip/)
    })

    it('rejects an unknown mode instead of misrouting to generations', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = sourceAdapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video',
          prompt: [{ type: 'text', content: 'p' }, sourceVideoPart],
          // Mode arrives untrusted from JSON callers; a typo must not fall
          // through to /videos/generations with a source-video body.
          // @ts-expect-error runtime validation of a non-GrokVideoMode string
          modelOptions: { mode: 'remix' },
          logger: testLogger,
        }),
      ).rejects.toThrow(/unknown modelOptions\.mode 'remix'/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects a video prompt part without an explicit mode', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = sourceAdapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video',
          prompt: [{ type: 'text', content: 'p' }, sourceVideoPart],
          logger: testLogger,
        }),
      ).rejects.toThrow(/needs modelOptions\.mode/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects a mode without a source video part', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = sourceAdapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video',
          prompt: 'p',
          modelOptions: { mode: 'extend' },
          logger: testLogger,
        }),
      ).rejects.toThrow(/requires a video prompt part/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects image prompt parts in edit / extend mode', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = sourceAdapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video',
          prompt: [
            { type: 'text', content: 'p' },
            sourceVideoPart,
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/a.png' },
            },
          ],
          modelOptions: { mode: 'edit' },
          logger: testLogger,
        }),
      ).rejects.toThrow(/takes only the source video/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects reference inputs in edit / extend mode', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = sourceAdapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video',
          prompt: [{ type: 'text', content: 'p' }, sourceVideoPart],
          modelOptions: {
            mode: 'edit',
            // Per-model map hides reference fields from v1.0; JSON callers
            // still hit the runtime gate.
            // @ts-expect-error reference_audios is 1.5-only
            reference_audios: [{ voice_id: 'eve' }],
          },
          logger: testLogger,
        }),
      ).rejects.toThrow(/reference inputs are only supported/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects more than one source video', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = sourceAdapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video',
          prompt: [
            { type: 'text', content: 'p' },
            sourceVideoPart,
            sourceVideoPart,
          ],
          modelOptions: { mode: 'edit' },
          logger: testLogger,
        }),
      ).rejects.toThrow(/at most one source video/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects edit / extend on grok-imagine-video-1.5', async () => {
      const fetchMock = mockFetch(() => jsonResponse({ request_id: 'r' }))
      const adapter = adapterWithFetch(fetchMock)

      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video-1.5',
          prompt: [
            { type: 'text', content: 'p' },
            // 1.5 has no video input on generateVideo(); createVideoJob still
            // accepts the part so JSON callers hit the runtime gate.
            sourceVideoPart,
          ],
          // @ts-expect-error mode is grok-imagine-video only
          modelOptions: { mode: 'edit' },
          logger: testLogger,
        }),
      ).rejects.toThrow(/does not support video editing or extension/)
      await expect(
        adapter.createVideoJob({
          model: 'grok-imagine-video-1.5',
          prompt: 'p',
          // @ts-expect-error mode is grok-imagine-video only
          modelOptions: { mode: 'extend' },
          logger: testLogger,
        }),
      ).rejects.toThrow(/does not support video editing or extension/)
      expect(fetchMock).not.toHaveBeenCalled()
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
          billed: { quantity: 5, unit: 'seconds' },
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
      expect(() =>
        validateVideoSize('grok-imagine-video-1.5', '2:3_1080p'),
      ).not.toThrow()
      expect(() =>
        validateVideoSize('grok-imagine-video', '16:9_1080p'),
      ).toThrow(/1080p/)
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
