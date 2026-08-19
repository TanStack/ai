import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  BytePlusVideoAdapter,
  byteplusVideo,
  createBytePlusVideo,
} from '../src/adapters/video'
import { isKnownBytePlusVideoModel } from '../src/model-meta'
import type {
  BytePlusVideoSize,
  ResolveBytePlusVideoSize,
} from '../src/model-meta'
import type {
  BytePlusVideoCreateRequest,
  BytePlusVideoTask,
} from '../src/video/wire-types'
import type { BytePlusVideoModel } from '../src/model-meta'
import type { MediaPromptPart, VideoGenerationOptions } from '@tanstack/ai'
import type { BytePlusVideoProviderOptions } from '../src/video/video-provider-options'

const logger = resolveDebugOption(false)

const VIDEO_URL =
  'https://ark-content-generation-v2-ap-southeast-1.tos-ap-southeast-1.volces.com/seedance/x.mp4'

/** Task id shape returned by a live `flex` create call (2026-07-31). */
const JOB_ID = 'cgt-batch-20260731174311-zmz5s'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * A `vi.fn` fetch stub with the real fetch parameter list, so call assertions
 * (`mock.calls[0]`) stay typed as `[input, init?]`.
 */
function mockFetch(handler: () => Response) {
  return vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
    handler(),
  )
}

function adapterWithFetch<TModel extends BytePlusVideoModel>(
  fetchMock: ReturnType<typeof mockFetch>,
  model: TModel,
) {
  return createBytePlusVideo(model, 'ark-test-key', { fetch: fetchMock })
}

/** Reads the JSON body the adapter sent on its first request. */
function sentRequest(
  fetchMock: ReturnType<typeof mockFetch>,
): BytePlusVideoCreateRequest {
  return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
}

function createOptions(
  overrides: Partial<
    VideoGenerationOptions<BytePlusVideoProviderOptions, string, number>
  > = {},
): VideoGenerationOptions<BytePlusVideoProviderOptions, any, any> {
  return {
    model: 'seedance-1-0-pro-fast-251015',
    prompt: 'a guitar being played in a store',
    logger,
    ...overrides,
  }
}

function imagePart(url: string, role?: string): MediaPromptPart {
  return {
    type: 'image',
    source: { type: 'url', value: url },
    ...(role && { metadata: { role: role as 'start_frame' } }),
  }
}

/** A succeeded task as documented by the Get action's response example. */
function succeededTask(overrides: Partial<BytePlusVideoTask> = {}) {
  return {
    id: JOB_ID,
    model: 'seedance-1-0-pro-fast-251015',
    status: 'succeeded',
    created_at: 1_718_049_470,
    updated_at: 1_718_053_070,
    content: { video_url: VIDEO_URL },
    usage: { completion_tokens: 35800, total_tokens: 35800 },
    ...overrides,
  } satisfies BytePlusVideoTask
}

describe('factories', () => {
  it('creates an adapter with the provided API key', () => {
    const adapter = createBytePlusVideo(
      'seedance-1-0-pro-fast-251015',
      'ark-test-key',
    )
    expect(adapter).toBeInstanceOf(BytePlusVideoAdapter)
    expect(adapter.kind).toBe('video')
    expect(adapter.name).toBe('byteplus')
    expect(adapter.model).toBe('seedance-1-0-pro-fast-251015')
  })

  it('byteplusVideo reads ARK_API_KEY from the environment', () => {
    vi.stubEnv('ARK_API_KEY', 'env-key')
    try {
      expect(byteplusVideo('dreamina-seedance-2-0-260128')).toBeInstanceOf(
        BytePlusVideoAdapter,
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('byteplusVideo names ARK_API_KEY when it is missing', () => {
    vi.stubEnv('ARK_API_KEY', '')
    vi.stubEnv('BYTEPLUS_API_KEY', '')
    try {
      expect(() => byteplusVideo('seedance-1-5-pro-251215')).toThrow(
        /ARK_API_KEY/,
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('createVideoJob', () => {
  it('posts to the Seedance task endpoint with Ark auth', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-0-pro-fast-251015')

    const result = await adapter.createVideoJob(createOptions())

    expect(result).toEqual({
      jobId: JOB_ID,
      model: 'seedance-1-0-pro-fast-251015',
    })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(
      'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks',
    )
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer ark-test-key',
      'Content-Type': 'application/json',
    })
  })

  it('merges configured defaultHeaders into the request', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = createBytePlusVideo(
      'seedance-1-0-pro-250528',
      'ark-test-key',
      { fetch: fetchMock, defaultHeaders: { 'X-Test-Id': 'video-1' } },
    )

    await adapter.createVideoJob(createOptions())

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer ark-test-key',
      'X-Test-Id': 'video-1',
    })
  })

  it('honours a custom baseURL, trailing slashes and all', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = createBytePlusVideo(
      'seedance-1-0-pro-250528',
      'ark-test-key',
      { fetch: fetchMock, baseURL: 'https://proxy.example.com/api/v3//' },
    )

    await adapter.createVideoJob(createOptions())

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://proxy.example.com/api/v3/contents/generations/tasks',
    )
  })

  it('splits the size template into ratio and resolution', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-5-pro-251215')

    await adapter.createVideoJob(
      createOptions({ size: '21:9_1080p', duration: 6 }),
    )

    expect(sentRequest(fetchMock)).toMatchObject({
      model: 'seedance-1-5-pro-251215',
      ratio: '21:9',
      resolution: '1080p',
      duration: 6,
      content: [{ type: 'text', text: 'a guitar being played in a store' }],
    })
  })

  it('accepts a bare ratio with no resolution suffix', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'dreamina-seedance-2-0-260128')

    await adapter.createVideoJob(createOptions({ size: 'adaptive' }))

    const request = sentRequest(fetchMock)
    expect(request.ratio).toBe('adaptive')
    expect(request.resolution).toBeUndefined()
  })

  it('lowercases the resolution, which the API matches case-insensitively', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'dreamina-seedance-2-0-260128')

    await adapter.createVideoJob(
      createOptions({ size: '16:9_4K' as '16:9_4k' }),
    )

    expect(sentRequest(fetchMock).resolution).toBe('4k')
  })

  it('rejects a resolution the model does not offer', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    // 4k is exclusive to the 2.0 flagship (live-probed).
    const adapter = adapterWithFetch(
      fetchMock,
      'dreamina-seedance-2-0-fast-260128',
    )

    await expect(
      adapter.createVideoJob(createOptions({ size: '16:9_4k' as '16:9_720p' })),
    ).rejects.toThrow(/resolution "4k" is not supported.*480p, 720p/s)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps Authorization when defaultHeaders tries to override it', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = createBytePlusVideo(
      'seedance-1-0-pro-250528',
      'ark-test-key',
      {
        fetch: fetchMock,
        defaultHeaders: { Authorization: 'Bearer not-the-real-key' },
      },
    )

    await adapter.createVideoJob(createOptions())

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer ark-test-key',
    })
  })

  // Live-probed 2026-07-31 and contradicting the BytePlus docs, which list
  // this model as 480p/720p. Guards the cell most likely to be "corrected"
  // back by someone reading the docs.
  it('accepts 1080p on seedance-1-0-pro-fast-251015', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-0-pro-fast-251015')

    await adapter.createVideoJob(createOptions({ size: '16:9_1080p' }))

    expect(sentRequest(fetchMock).resolution).toBe('1080p')
  })

  // No Seedance model has a 2K tier, including the 2.0 flagship whose docs
  // advertise "up to 4K". The cast mimics a caller who trusted the docs.
  it('rejects a 2k resolution on every model', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'dreamina-seedance-2-0-260128')

    await expect(
      adapter.createVideoJob(
        createOptions({ size: '16:9_2k' as '16:9_1080p' }),
      ),
    ).rejects.toThrow(/resolution "2k" is not supported/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('validates a resolution that modelOptions introduced', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    // 4k is exclusive to the 2.0 flagship; overriding a valid size with it
    // must fail locally rather than reaching Ark.
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-5-pro-251215')

    await expect(
      adapter.createVideoJob(
        createOptions({
          size: '16:9_720p',
          modelOptions: { resolution: '4k' as '1080p' },
        }),
      ),
    ).rejects.toThrow(/resolution "4k" is not supported.*480p, 720p, 1080p/s)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a malformed size template', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-0-pro-250528')

    await expect(
      adapter.createVideoJob(createOptions({ size: '720p' as '16:9' })),
    ).rejects.toThrow(/is not supported by model/)
  })

  it('snaps the generic duration into the model range', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-0-pro-fast-251015')

    await adapter.createVideoJob(createOptions({ duration: 99 }))

    expect(sentRequest(fetchMock).duration).toBe(12)
  })

  it('lets modelOptions override the derived fields', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-5-pro-251215')

    await adapter.createVideoJob(
      createOptions({
        size: '16:9_720p',
        duration: 5,
        modelOptions: {
          resolution: '1080p',
          // -1 (model picks the length) is only reachable through
          // modelOptions, which is why it is not snapped.
          duration: -1,
          service_tier: 'flex',
          draft: true,
        },
      }),
    )

    expect(sentRequest(fetchMock)).toMatchObject({
      ratio: '16:9',
      resolution: '1080p',
      duration: -1,
      service_tier: 'flex',
      draft: true,
    })
  })

  it('surfaces an Ark error envelope', async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse(
        {
          error: {
            code: 'InvalidParameter',
            message: 'the parameter duration is not valid',
            type: 'BadRequest',
          },
        },
        400,
      ),
    )
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-0-pro-250528')

    await expect(adapter.createVideoJob(createOptions())).rejects.toThrow(
      /video task creation failed \(400 InvalidParameter\): the parameter duration is not valid/,
    )
  })

  it('fails when the response carries no task id', async () => {
    const fetchMock = mockFetch(() => jsonResponse({}))
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-0-pro-250528')

    await expect(adapter.createVideoJob(createOptions())).rejects.toThrow(
      /returned no task id/,
    )
  })
})

describe('createVideoJob content roles', () => {
  it('sends an un-roled image as the opening frame', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-0-pro-fast-251015')

    await adapter.createVideoJob(
      createOptions({
        prompt: [
          { type: 'text', content: 'the guitarist starts playing' },
          imagePart('https://example.com/shop.jpg'),
        ],
      }),
    )

    expect(sentRequest(fetchMock).content).toEqual([
      { type: 'text', text: 'the guitarist starts playing' },
      {
        type: 'image_url',
        image_url: { url: 'https://example.com/shop.jpg' },
        role: 'first_frame',
      },
    ])
  })

  it('maps start_frame and end_frame onto first_frame and last_frame', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-5-pro-251215')

    await adapter.createVideoJob(
      createOptions({
        prompt: [
          imagePart('https://example.com/open.jpg', 'start_frame'),
          imagePart('https://example.com/close.jpg', 'end_frame'),
        ],
      }),
    )

    expect(sentRequest(fetchMock).content).toEqual([
      {
        type: 'image_url',
        image_url: { url: 'https://example.com/open.jpg' },
        role: 'first_frame',
      },
      {
        type: 'image_url',
        image_url: { url: 'https://example.com/close.jpg' },
        role: 'last_frame',
      },
    ])
  })

  it('maps reference and character images onto reference_image', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'dreamina-seedance-2-0-260128')

    await adapter.createVideoJob(
      createOptions({
        prompt: [
          imagePart('https://example.com/a.jpg', 'reference'),
          imagePart('https://example.com/b.jpg', 'character'),
        ],
      }),
    )

    expect(sentRequest(fetchMock).content).toEqual([
      {
        type: 'image_url',
        image_url: { url: 'https://example.com/a.jpg' },
        role: 'reference_image',
      },
      {
        type: 'image_url',
        image_url: { url: 'https://example.com/b.jpg' },
        role: 'reference_image',
      },
    ])
  })

  it('maps video and audio parts onto reference_video and reference_audio', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'dreamina-seedance-2-0-260128')

    await adapter.createVideoJob(
      createOptions({
        prompt: [
          { type: 'text', content: 'match this camera move' },
          { type: 'video', source: { type: 'url', value: 'https://x/v.mp4' } },
          { type: 'audio', source: { type: 'url', value: 'https://x/a.mp3' } },
        ],
      }),
    )

    expect(sentRequest(fetchMock).content).toEqual([
      { type: 'text', text: 'match this camera move' },
      {
        type: 'video_url',
        video_url: { url: 'https://x/v.mp4' },
        role: 'reference_video',
      },
      {
        type: 'audio_url',
        audio_url: { url: 'https://x/a.mp3' },
        role: 'reference_audio',
      },
    ])
  })

  it('sends base64 image sources as data URIs', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-0-pro-250528')

    await adapter.createVideoJob(
      createOptions({
        prompt: [
          {
            type: 'image',
            source: { type: 'data', value: 'AAAA', mimeType: 'image/PNG' },
          },
        ],
      }),
    )

    expect(sentRequest(fetchMock).content).toEqual([
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,AAAA' },
        role: 'first_frame',
      },
    ])
  })

  it('rejects mixing frame roles with reference roles', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'dreamina-seedance-2-0-260128')

    await expect(
      adapter.createVideoJob(
        createOptions({
          prompt: [
            imagePart('https://example.com/open.jpg', 'start_frame'),
            imagePart('https://example.com/ref.jpg', 'reference'),
          ],
        }),
      ),
    ).rejects.toThrow(/cannot be combined with reference media/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports the mode mix, not the audio rule, for a frame plus audio', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'dreamina-seedance-2-0-260128')

    await expect(
      adapter.createVideoJob(
        createOptions({
          prompt: [
            imagePart('https://example.com/open.jpg', 'start_frame'),
            {
              type: 'audio',
              source: { type: 'url', value: 'https://x/a.mp3' },
            },
          ],
        }),
      ),
      // Advising the caller to add another reference would still fail — the
      // real defect is the frame/reference mix.
    ).rejects.toThrow(/cannot be combined with reference media/)
  })

  it('rejects more than one opening frame', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'dreamina-seedance-2-0-260128')

    await expect(
      adapter.createVideoJob(
        createOptions({
          prompt: [
            imagePart('https://example.com/a.jpg'),
            imagePart('https://example.com/b.jpg', 'start_frame'),
          ],
        }),
      ),
    ).rejects.toThrow(/at most one opening frame; received 2/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a closing frame with no opening frame', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-5-pro-251215')

    await expect(
      adapter.createVideoJob(
        createOptions({
          prompt: [imagePart('https://example.com/close.jpg', 'end_frame')],
        }),
      ),
    ).rejects.toThrow(/closing frame needs an opening frame/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a reference audio that is the only reference input on 2.0', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'dreamina-seedance-2-0-260128')

    await expect(
      adapter.createVideoJob(
        createOptions({
          prompt: [
            { type: 'text', content: 'use this score' },
            {
              type: 'audio',
              source: { type: 'url', value: 'https://x/a.mp3' },
            },
          ],
        }),
      ),
    ).rejects.toThrow(/cannot be the only reference/)
  })

  it('accepts audio-only reference input on Seedance 2.5', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'dreamina-seedance-2-5-260628')

    await adapter.createVideoJob(
      createOptions({
        prompt: [
          { type: 'text', content: 'use this score' },
          {
            type: 'audio',
            source: { type: 'url', value: 'https://x/a.mp3' },
          },
        ],
      }),
    )

    expect(sentRequest(fetchMock).content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'audio_url',
          role: 'reference_audio',
        }),
      ]),
    )
  })

  it('accepts 1080p on Seedance 2.5', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'dreamina-seedance-2-5-260628')

    await adapter.createVideoJob(createOptions({ size: '16:9_1080p' }))

    expect(sentRequest(fetchMock).resolution).toBe('1080p')
  })

  it('rejects 4k on Seedance 2.5', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'dreamina-seedance-2-5-260628')

    await expect(
      adapter.createVideoJob(
        createOptions({ size: '16:9_4k' as '16:9_1080p' }),
      ),
    ).rejects.toThrow(/resolution "4k" is not supported.*480p, 720p, 1080p/s)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forwards output_format on Seedance 2.5', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'dreamina-seedance-2-5-260628')

    await adapter.createVideoJob(
      createOptions({
        modelOptions: { output_format: 'mov' },
      }),
    )

    expect(sentRequest(fetchMock).output_format).toBe('mov')
  })

  it('rejects reference images on a model without reference mode', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-5-pro-251215')

    await expect(
      adapter.createVideoJob(
        createOptions({
          prompt: [imagePart('https://example.com/ref.jpg', 'reference')],
        }),
      ),
    ).rejects.toThrow(/does not support reference images/)
  })

  it('rejects a closing frame on seedance-1-0-pro-fast', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-0-pro-fast-251015')

    await expect(
      adapter.createVideoJob(
        createOptions({
          prompt: [
            imagePart('https://example.com/open.jpg', 'start_frame'),
            imagePart('https://example.com/close.jpg', 'end_frame'),
          ],
        }),
      ),
    ).rejects.toThrow(/does not support a closing frame/)
  })

  // The per-model modality map makes these compile errors; the casts stand in
  // for JS callers and for a prompt built from untyped data.
  it('rejects video prompt parts on a 1.x model', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-5-pro-251215')

    await expect(
      adapter.createVideoJob(
        createOptions({
          prompt: [
            {
              type: 'video',
              source: { type: 'url', value: 'https://x/v.mp4' },
            },
          ] as Array<MediaPromptPart>,
        }),
      ),
    ).rejects.toThrow(/does not accept video prompt parts/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects audio prompt parts on a 1.x model', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-0-pro-250528')

    await expect(
      adapter.createVideoJob(
        createOptions({
          prompt: [
            {
              type: 'audio',
              source: { type: 'url', value: 'https://x/a.mp3' },
            },
          ] as Array<MediaPromptPart>,
        }),
      ),
    ).rejects.toThrow(/does not accept audio prompt parts/)
  })

  // The create schema says maxItems: 5, but Ark accepted 7 live, so the
  // adapter passes long prompts through rather than rejecting what the API
  // would have taken.
  it('does not cap the content array locally', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'dreamina-seedance-2-0-260128')

    await adapter.createVideoJob(
      createOptions({
        prompt: [
          { type: 'text', content: 'blend these' },
          imagePart('https://example.com/1.jpg', 'reference'),
          imagePart('https://example.com/2.jpg', 'reference'),
          imagePart('https://example.com/3.jpg', 'reference'),
          imagePart('https://example.com/4.jpg', 'reference'),
          imagePart('https://example.com/5.jpg', 'reference'),
        ],
      }),
    )

    expect(sentRequest(fetchMock).content).toHaveLength(6)
  })

  it('rejects mask and control roles Seedance has no channel for', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'dreamina-seedance-2-0-260128')

    await expect(
      adapter.createVideoJob(
        createOptions({
          prompt: [imagePart('https://example.com/m.png', 'mask')],
        }),
      ),
    ).rejects.toThrow(/has no 'mask' image input/)
  })

  it('rejects an empty prompt', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-0-pro-250528')

    await expect(
      adapter.createVideoJob(createOptions({ prompt: [] })),
    ).rejects.toThrow(/must carry text or at least one media input/)
  })
})

describe('getVideoStatus', () => {
  it.each([
    ['queued', 'pending'],
    ['running', 'processing'],
    ['succeeded', 'completed'],
    ['failed', 'failed'],
    ['expired', 'failed'],
    ['cancelled', 'failed'],
  ] as const)('maps %s to %s', async (apiStatus, expected) => {
    const fetchMock = mockFetch(() =>
      jsonResponse({ id: JOB_ID, status: apiStatus }),
    )
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-0-pro-fast-251015')

    const status = await adapter.getVideoStatus(JOB_ID)

    expect(status.status).toBe(expected)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/${JOB_ID}`,
    )
  })

  // Core's poll loop treats `processing` as "keep waiting", so a status it
  // can't map must not answer `processing` — that turns a malformed or
  // newly-added terminal state into a silent poll to `maxDuration` and a
  // generic timeout, with what Ark actually sent never reaching the caller.
  it.each([
    ['a status Ark adds later', { id: JOB_ID, status: 'rejected' }],
    ['a task with no status at all', { id: JOB_ID }],
  ])('throws naming %s', async (_label, body) => {
    const adapter = adapterWithFetch(
      mockFetch(() => jsonResponse(body)),
      'seedance-1-0-pro-fast-251015',
    )

    await expect(adapter.getVideoStatus(JOB_ID)).rejects.toThrow(
      /unrecognized Seedance task status/,
    )
  })

  it('names the offending status value in the error', async () => {
    const adapter = adapterWithFetch(
      mockFetch(() => jsonResponse({ id: JOB_ID, status: 'rejected' })),
      'seedance-1-0-pro-fast-251015',
    )

    await expect(adapter.getVideoStatus(JOB_ID)).rejects.toThrow(/"rejected"/)
  })

  // `readJsonBody` returns `undefined` for an empty body and the raw text for
  // a non-JSON one — both documented failure modes of these hosts (an HTML
  // error page from a proxy). Casting either to a task hides the body.
  it.each([
    ['an empty body', new Response('', { status: 200 })],
    [
      'an HTML error page served with 200',
      new Response('<html><body>502 Bad Gateway</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    ],
  ])('throws with the body in hand for %s', async (_label, response) => {
    const adapter = adapterWithFetch(
      mockFetch(() => response),
      'seedance-1-0-pro-fast-251015',
    )

    await expect(adapter.getVideoStatus(JOB_ID)).rejects.toThrow(
      /non-object body/,
    )
  })

  it('carries the raw HTML into the error so the failure stays diagnosable', async () => {
    const adapter = adapterWithFetch(
      mockFetch(
        () =>
          new Response('<html><body>502 Bad Gateway</body></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
      'seedance-1-0-pro-fast-251015',
    )

    await expect(adapter.getVideoStatus(JOB_ID)).rejects.toThrow(
      /502 Bad Gateway/,
    )
  })

  // Core does `throw new Error(statusResult.error || 'Video generation
  // failed')`, so a failure with no `error` block must still carry something
  // identifying or the caller gets an unattributable error.
  it('describes a failed task that carries no error block', async () => {
    const adapter = adapterWithFetch(
      mockFetch(() =>
        jsonResponse({
          id: JOB_ID,
          status: 'failed',
          model: 'seedance-1-0-pro-fast-251015',
        }),
      ),
      'seedance-1-0-pro-fast-251015',
    )

    const status = await adapter.getVideoStatus(JOB_ID)

    expect(status.status).toBe('failed')
    expect(status.error).toContain(JOB_ID)
    expect(status.error).toContain('seedance-1-0-pro-fast-251015')
    expect(status.error).toContain('no error detail')
  })

  it('surfaces the error code and message of a failed task', async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse({
        id: JOB_ID,
        status: 'failed',
        error: {
          code: 'OutputVideoSensitiveContentDetected',
          message: 'The request failed because the output video may contain…',
        },
      }),
    )
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-0-pro-fast-251015')

    expect(await adapter.getVideoStatus(JOB_ID)).toEqual({
      jobId: JOB_ID,
      status: 'failed',
      error:
        'OutputVideoSensitiveContentDetected: The request failed because the output video may contain…',
    })
  })

  it('explains an expired task, which carries no error block', async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse({ id: JOB_ID, status: 'expired' }),
    )
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-5-pro-251215')

    const status = await adapter.getVideoStatus(JOB_ID)

    expect(status.error).toMatch(/expired before it finished/)
  })

  it('reports a 404 as a failed job rather than throwing', async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse(
        { error: { code: 'NotFound', message: 'task not found' } },
        404,
      ),
    )
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-0-pro-250528')

    const result = await adapter.getVideoStatus(JOB_ID)
    expect(result).toMatchObject({ jobId: JOB_ID, status: 'failed' })
    // Ark's own code/message is kept: a 404 from a wrong baseURL or a proxy in
    // front of the API is not an expired job id, and collapsing both to a bare
    // "Job not found" points the caller at the wrong cause.
    expect(result.error).toContain(JOB_ID)
    expect(result.error).toContain('NotFound')
    expect(result.error).toContain('task not found')
  })

  it('propagates non-404 lookup failures', async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse(
        {
          error: {
            code: 'RateLimitExceeded.FoundationModelRPMExceeded',
            message: 'RPM exceeded',
          },
        },
        429,
      ),
    )
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-0-pro-250528')

    await expect(adapter.getVideoStatus(JOB_ID)).rejects.toThrow(
      /429 RateLimitExceeded.FoundationModelRPMExceeded/,
    )
  })
})

describe('getVideoUrl', () => {
  it('returns the URL, its 24h expiry and usage', async () => {
    const task = succeededTask()
    const fetchMock = mockFetch(() => jsonResponse(task))
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-0-pro-fast-251015')

    const result = await adapter.getVideoUrl(JOB_ID)

    expect(result.url).toBe(VIDEO_URL)
    // Anchored on updated_at (when the output appeared), not created_at.
    expect(result.expiresAt).toEqual(
      new Date((task.updated_at + 24 * 60 * 60) * 1000),
    )
    expect(result.usage).toEqual({
      promptTokens: 0,
      completionTokens: 35800,
      totalTokens: 35800,
      unitsBilled: 35800,
    })
  })

  it('falls back to created_at when the task has no updated_at', async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse({
        id: JOB_ID,
        status: 'succeeded',
        created_at: 1_718_049_470,
        content: { video_url: VIDEO_URL },
      }),
    )
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-0-pro-fast-251015')

    const result = await adapter.getVideoUrl(JOB_ID)

    expect(result.expiresAt).toEqual(
      new Date((1_718_049_470 + 24 * 60 * 60) * 1000),
    )
  })

  it('coerces usage counts the schema types as strings', async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse(
        succeededTask({
          usage: { completion_tokens: '35800', total_tokens: '35800' },
        }),
      ),
    )
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-5-pro-251215')

    expect((await adapter.getVideoUrl(JOB_ID)).usage).toMatchObject({
      completionTokens: 35800,
      totalTokens: 35800,
      unitsBilled: 35800,
    })
  })

  it('omits usage when the task reports none', async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse(succeededTask({ usage: undefined })),
    )
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-5-pro-251215')

    expect((await adapter.getVideoUrl(JOB_ID)).usage).toBeUndefined()
  })

  it('throws with the failure detail when the task failed', async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse({
        id: JOB_ID,
        status: 'failed',
        error: {
          code: 'InputImageSensitiveContentDetected',
          message: 'input image may contain sensitive information',
        },
      }),
    )
    const adapter = adapterWithFetch(fetchMock, 'dreamina-seedance-2-0-260128')

    await expect(adapter.getVideoUrl(JOB_ID)).rejects.toThrow(
      /Video generation failed: InputImageSensitiveContentDetected: input image may contain sensitive information/,
    )
  })

  it('throws while the task is still running', async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse({ id: JOB_ID, status: 'running' }),
    )
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-0-pro-250528')

    await expect(adapter.getVideoUrl(JOB_ID)).rejects.toThrow(
      /not ready for download/,
    )
  })

  it('throws a job-not-found error on 404', async () => {
    const fetchMock = mockFetch(() => jsonResponse({}, 404))
    const adapter = adapterWithFetch(fetchMock, 'seedance-1-0-pro-250528')

    await expect(adapter.getVideoUrl(JOB_ID)).rejects.toThrow(
      `Video job not found: ${JOB_ID}`,
    )
  })
})

// The factories accept any string so an id BytePlus ships between package
// releases still works. Seedance 2.5 used to be this example; it is now a
// first-class known model. These cover the still-open unknown-id path.
describe('unknown model ids', () => {
  const FUTURE = 'dreamina-seedance-9-9-999999'

  it('accepts a bare string through the factories', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = createBytePlusVideo(FUTURE, 'ark-test-key', {
      fetch: fetchMock,
    })

    expect(adapter.model).toBe(FUTURE)
    expect(await adapter.createVideoJob(createOptions())).toEqual({
      jobId: JOB_ID,
      model: FUTURE,
    })
  })

  it('passes resolutions and ratios through without the per-model table', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = createBytePlusVideo(FUTURE, 'ark-test-key', {
      fetch: fetchMock,
    })

    // '8k' and '32:9' exist on no model today; a future model may have both.
    await adapter.createVideoJob(createOptions({ size: '32:9_8K' }))

    expect(sentRequest(fetchMock)).toMatchObject({
      ratio: '32:9',
      resolution: '8k',
    })
  })

  it('sends an unknown model duration verbatim rather than clamping it', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = createBytePlusVideo(FUTURE, 'ark-test-key', {
      fetch: fetchMock,
    })

    // 45s is outside every range shipping today; clamping to 30 would corrupt
    // a legitimate request for a model with a longer ceiling.
    await adapter.createVideoJob(createOptions({ duration: 45 }))

    expect(sentRequest(fetchMock).duration).toBe(45)
  })

  it('passes provider options through ungated', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = createBytePlusVideo(FUTURE, 'ark-test-key', {
      fetch: fetchMock,
    })

    // draft is 1.5-pro-only and priority is 2.x-only today; on an unknown
    // model neither is second-guessed.
    await adapter.createVideoJob(
      createOptions({ modelOptions: { draft: true, priority: 3 } }),
    )

    expect(sentRequest(fetchMock)).toMatchObject({ draft: true, priority: 3 })
  })

  it('stands down the media-shape guards', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = createBytePlusVideo(FUTURE, 'ark-test-key', {
      fetch: fetchMock,
    })

    // Frame + reference is mutually exclusive on every known model. A future
    // model that relaxes it must not be blocked by today's tables.
    await adapter.createVideoJob(
      createOptions({
        prompt: [
          imagePart('https://example.com/open.jpg', 'start_frame'),
          imagePart('https://example.com/ref.jpg', 'reference'),
        ],
      }),
    )

    expect(sentRequest(fetchMock).content).toEqual([
      {
        type: 'image_url',
        image_url: { url: 'https://example.com/open.jpg' },
        role: 'first_frame',
      },
      {
        type: 'image_url',
        image_url: { url: 'https://example.com/ref.jpg' },
        role: 'reference_image',
      },
    ])
  })

  it('still rejects roles the wire format cannot carry on any model', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: JOB_ID }))
    const adapter = createBytePlusVideo(FUTURE, 'ark-test-key', {
      fetch: fetchMock,
    })

    await expect(
      adapter.createVideoJob(
        createOptions({
          prompt: [imagePart('https://example.com/m.png', 'mask')],
        }),
      ),
    ).rejects.toThrow(/has no 'mask' image input/)
  })

  it('reports the union of known ranges as its duration hint', () => {
    const adapter = createBytePlusVideo(FUTURE, 'ark-test-key')

    expect(adapter.availableDurations()).toEqual({
      kind: 'range',
      min: 2,
      max: 30,
      step: 1,
      unit: 'seconds',
    })
  })

  it('knows which ids it has metadata for', () => {
    expect(isKnownBytePlusVideoModel('seedance-1-5-pro-251215')).toBe(true)
    expect(isKnownBytePlusVideoModel('dreamina-seedance-2-5-260628')).toBe(true)
    expect(isKnownBytePlusVideoModel(FUTURE)).toBe(false)
  })
})

describe('model id typing', () => {
  it('accepts a bare string while keeping known ids narrowed', () => {
    // A plain string compiles through both factories — the escape hatch's
    // whole point. `toBeCallableWith` checks the signature without running
    // byteplusVideo, which would need ARK_API_KEY.
    expectTypeOf(byteplusVideo).toBeCallableWith('dreamina-seedance-9-9-999999')
    const adapter = createBytePlusVideo('dreamina-seedance-9-9-999999', 'k')
    expectTypeOf(adapter.model).toEqualTypeOf<'dreamina-seedance-9-9-999999'>()

    // Known ids keep their probe-verified size union, so a tier the model
    // does not offer stays a compile error.
    expectTypeOf<
      ResolveBytePlusVideoSize<'dreamina-seedance-2-5-260628'>
    >().toEqualTypeOf<BytePlusVideoSize<'480p' | '720p' | '1080p'>>()
    expectTypeOf<
      ResolveBytePlusVideoSize<'dreamina-seedance-2-0-fast-260128'>
    >().toEqualTypeOf<BytePlusVideoSize<'480p' | '720p'>>()
    expectTypeOf<
      ResolveBytePlusVideoSize<'dreamina-seedance-2-0-260128'>
    >().toEqualTypeOf<BytePlusVideoSize<'480p' | '720p' | '1080p' | '4k'>>()

    // An unknown id widens instead.
    expectTypeOf<ResolveBytePlusVideoSize<'anything-else'>>().toEqualTypeOf<
      BytePlusVideoSize | (string & {})
    >()
  })
})

describe('durations', () => {
  it.each([
    ['dreamina-seedance-2-5-260628', 4, 30],
    ['dreamina-seedance-2-0-260128', 4, 15],
    ['dreamina-seedance-2-0-fast-260128', 4, 15],
    ['dreamina-seedance-2-0-mini-260615', 4, 15],
    ['seedance-1-5-pro-251215', 4, 12],
    ['seedance-1-0-pro-250528', 2, 12],
    ['seedance-1-0-pro-fast-251015', 2, 12],
  ] as const)('reports the %s range as %i–%i seconds', (model, min, max) => {
    const adapter = createBytePlusVideo(model, 'ark-test-key')

    expect(adapter.availableDurations()).toEqual({
      kind: 'range',
      min,
      max,
      step: 1,
      unit: 'seconds',
    })
  })

  it('snaps below, above and between the range', () => {
    const adapter = createBytePlusVideo('seedance-1-5-pro-251215', 'k')

    expect(adapter.snapDuration(1)).toBe(4)
    expect(adapter.snapDuration(6.4)).toBe(6)
    expect(adapter.snapDuration(6.6)).toBe(7)
    expect(adapter.snapDuration(30)).toBe(12)
  })
})
