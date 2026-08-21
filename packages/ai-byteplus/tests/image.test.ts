import { describe, expect, it, vi } from 'vitest'
import { generateImage } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  BytePlusImageAdapter,
  byteplusImage,
  createBytePlusImage,
} from '../src/adapters/image'
import { parseBytePlusImageSize } from '../src/image/image-provider-options'
import type { BytePlusSeedream5ImageProviderOptions } from '../src/image/image-provider-options'
import type { BytePlusImageGenerationRequest } from '../src/image/wire-types'
import type {
  ImagePart,
  MediaInputMetadata,
  MediaPromptPart,
} from '@tanstack/ai'

const testLogger = resolveDebugOption(false)

const IMAGE_URL =
  'https://ark-content-generation-v2-ap-southeast-1.tos-ap-southeast-1.volces.com/seedream/x.png'

/** Live-verified `seedream-4-0-250828` response body (2026-07-31). */
const successBody = {
  model: 'seedream-4-0-250828',
  created: 1_754_000_000,
  data: [{ url: IMAGE_URL, size: '1152x864' }],
  usage: { generated_images: 1, output_tokens: 3888, total_tokens: 3888 },
}

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

/** Reads the JSON body the adapter sent on its first (only) request. */
function sentRequest(
  fetchMock: ReturnType<typeof mockFetch>,
): BytePlusImageGenerationRequest {
  const init = fetchMock.mock.calls[0]?.[1]
  return JSON.parse(String(init?.body))
}

function adapterWithFetch(
  fetchMock: ReturnType<typeof mockFetch>,
  model:
    | 'seedream-4-0-250828'
    | 'seedream-5-0-lite-260128'
    | 'dola-seedream-5-0-pro-260628' = 'seedream-4-0-250828',
) {
  return createBytePlusImage(model, 'ark-test-key', { fetch: fetchMock })
}

function imagePart(value: string): ImagePart<MediaInputMetadata> {
  return { type: 'image', source: { type: 'url', value } }
}

/**
 * A logger whose every level is captured. `resolveDebugOption` with a partial
 * config turns all categories on, so `logger.errors()` and `logger.warn()`
 * both reach the spy (the shared `testLogger` uses `false`, which silences
 * everything including errors).
 */
function capturingLogger() {
  const spy = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
  return { spy, logger: resolveDebugOption({ logger: spy }) }
}

/** Joins every message a spy level received, for substring assertions. */
function messages(level: ReturnType<typeof vi.fn>): string {
  return level.mock.calls.map((call) => String(call[0])).join('\n')
}

describe('factories', () => {
  it('creates an adapter with the provided API key', () => {
    const adapter = createBytePlusImage('seedream-4-0-250828', 'ark-test-key')
    expect(adapter).toBeInstanceOf(BytePlusImageAdapter)
    expect(adapter.kind).toBe('image')
    expect(adapter.name).toBe('byteplus')
    expect(adapter.model).toBe('seedream-4-0-250828')
  })

  it('byteplusImage reads ARK_API_KEY from the environment', () => {
    vi.stubEnv('ARK_API_KEY', 'env-key')
    try {
      expect(byteplusImage('seedream-5-0-260128')).toBeInstanceOf(
        BytePlusImageAdapter,
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('byteplusImage names ARK_API_KEY when it is missing', () => {
    vi.stubEnv('ARK_API_KEY', '')
    try {
      expect(() => byteplusImage('seedream-5-0-260128')).toThrow(/ARK_API_KEY/)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('request shape', () => {
  it('posts to the Ark images endpoint with a bearer token', async () => {
    const fetchMock = mockFetch(() => jsonResponse(successBody))
    await adapterWithFetch(fetchMock).generateImages({
      model: 'seedream-4-0-250828',
      prompt: 'a guitar in a sunlit workshop',
      logger: testLogger,
    })

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(
      'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations',
    )
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer ark-test-key',
      'Content-Type': 'application/json',
    })
    expect(sentRequest(fetchMock)).toEqual({
      model: 'seedream-4-0-250828',
      prompt: 'a guitar in a sunlit workshop',
    })
  })

  it('honours a custom base URL and merges configured default headers', async () => {
    const fetchMock = mockFetch(() => jsonResponse(successBody))
    const adapter = createBytePlusImage('seedream-4-0-250828', 'ark-test-key', {
      // The trailing slash must not survive into the request path.
      baseURL: 'https://ark.eu-west.bytepluses.com/api/v3/',
      defaultHeaders: { 'X-Test-Id': 'abc', 'X-Dropped': null },
      fetch: fetchMock,
    })
    await adapter.generateImages({
      model: 'seedream-4-0-250828',
      prompt: 'a guitar',
      logger: testLogger,
    })

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(
      'https://ark.eu-west.bytepluses.com/api/v3/images/generations',
    )
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer ark-test-key',
      'X-Test-Id': 'abc',
    })
    // Null-valued entries are dropped rather than serialized as "null".
    expect(init?.headers).not.toHaveProperty('X-Dropped')
  })

  it('sends a size token unchanged and normalizes its case', async () => {
    const fetchMock = mockFetch(() => jsonResponse(successBody))
    await adapterWithFetch(fetchMock).generateImages({
      model: 'seedream-4-0-250828',
      prompt: 'a guitar',
      // Lowercase tokens are normalized at runtime for JS callers; the type
      // only advertises the canonical uppercase form.
      size: '2k' as '2K',
      logger: testLogger,
    })
    expect(sentRequest(fetchMock).size).toBe('2K')
  })

  it('sends explicit pixel sizes', async () => {
    const fetchMock = mockFetch(() => jsonResponse(successBody))
    await adapterWithFetch(fetchMock).generateImages({
      model: 'seedream-4-0-250828',
      prompt: 'a guitar',
      size: '2048x2048',
      logger: testLogger,
    })
    expect(sentRequest(fetchMock).size).toBe('2048x2048')
  })

  it('rejects a size that mixes the token and pixel forms', async () => {
    const fetchMock = mockFetch(() => jsonResponse(successBody))
    await expect(
      adapterWithFetch(fetchMock).generateImages({
        model: 'seedream-4-0-250828',
        prompt: 'a guitar',
        // Invalid at runtime and at compile time; the cast keeps the
        // runtime-validation path reachable from the test.
        size: '2K x 1024' as '2K',
        logger: testLogger,
      }),
    ).rejects.toThrow(/never a mix of the two/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps prompt image parts to the image reference array', async () => {
    const fetchMock = mockFetch(() => jsonResponse(successBody))
    await adapterWithFetch(fetchMock).generateImages({
      model: 'seedream-4-0-250828',
      prompt: [
        { type: 'text', content: 'put the guitar on a beach' },
        imagePart('https://example.com/guitar.png'),
        {
          type: 'image',
          source: { type: 'data', value: 'AAAA', mimeType: 'image/PNG' },
        },
      ],
      logger: testLogger,
    })

    const request = sentRequest(fetchMock)
    expect(request.image).toEqual([
      'https://example.com/guitar.png',
      // BytePlus requires a lowercase format in the data URI.
      'data:image/png;base64,AAAA',
    ])
    expect(request.prompt).toBe('put the guitar on a beach')
  })

  it('enforces the per-model reference-image limit', async () => {
    const fetchMock = mockFetch(() => jsonResponse(successBody))
    const prompt: Array<MediaPromptPart> = [
      { type: 'text', content: 'blend these' },
      ...Array.from({ length: 11 }, (_, index) =>
        imagePart(`https://example.com/${index}.png`),
      ),
    ]

    // 5.0 Pro caps references at 10; the other models accept 14.
    await expect(
      adapterWithFetch(
        fetchMock,
        'dola-seedream-5-0-pro-260628',
      ).generateImages({
        model: 'dola-seedream-5-0-pro-260628',
        prompt,
        logger: testLogger,
      }),
    ).rejects.toThrow(/at most 10 reference images; received 11/)

    await expect(
      adapterWithFetch(fetchMock).generateImages({
        model: 'seedream-4-0-250828',
        prompt,
        logger: testLogger,
      }),
    ).resolves.toMatchObject({ model: 'seedream-4-0-250828' })
  })

  it('passes a data-URI image source through untouched', async () => {
    const fetchMock = mockFetch(() => jsonResponse(successBody))
    await adapterWithFetch(fetchMock).generateImages({
      model: 'seedream-4-0-250828',
      prompt: [
        { type: 'text', content: 'restyle this' },
        {
          type: 'image',
          source: {
            type: 'data',
            value: 'data:image/jpeg;base64,QUJD',
            mimeType: 'image/jpeg',
          },
        },
      ],
      logger: testLogger,
    })

    // Already a data URI: it must not be wrapped in a second `data:` prefix.
    expect(sentRequest(fetchMock).image).toEqual([
      'data:image/jpeg;base64,QUJD',
    ])
  })

  it('rejects roles outside the reference allow-list', async () => {
    const fetchMock = mockFetch(() => jsonResponse(successBody))
    await expect(
      adapterWithFetch(fetchMock).generateImages({
        model: 'seedream-4-0-250828',
        prompt: [
          { type: 'text', content: 'inpaint this' },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/mask.png' },
            metadata: { role: 'mask' },
          },
        ],
        logger: testLogger,
      }),
    ).rejects.toThrow(/no mask input/)

    // Video-oriented roles must fail loudly rather than be flattened into a
    // plain reference — that is the point of the allow-list.
    await expect(
      adapterWithFetch(fetchMock).generateImages({
        model: 'seedream-4-0-250828',
        prompt: [
          { type: 'text', content: 'start from this' },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/frame.png' },
            metadata: { role: 'start_frame' },
          },
        ],
        logger: testLogger,
      }),
    ).rejects.toThrow(/no start_frame input/)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts the reference and character roles', async () => {
    const fetchMock = mockFetch(() => jsonResponse(successBody))
    await adapterWithFetch(fetchMock).generateImages({
      model: 'seedream-4-0-250828',
      prompt: [
        { type: 'text', content: 'put @Image1 next to @Image2' },
        {
          type: 'image',
          source: { type: 'url', value: 'https://example.com/a.png' },
          metadata: { role: 'reference' },
        },
        {
          type: 'image',
          source: { type: 'url', value: 'https://example.com/b.png' },
          metadata: { role: 'character' },
        },
      ],
      logger: testLogger,
    })

    expect(sentRequest(fetchMock).image).toEqual([
      'https://example.com/a.png',
      'https://example.com/b.png',
    ])
  })

  it('rejects video and audio prompt parts', async () => {
    const fetchMock = mockFetch(() => jsonResponse(successBody))
    await expect(
      adapterWithFetch(fetchMock).generateImages({
        model: 'seedream-4-0-250828',
        prompt: [
          { type: 'text', content: 'a still from this' },
          {
            type: 'video',
            source: { type: 'url', value: 'https://example.com/clip.mp4' },
          },
        ],
        logger: testLogger,
      }),
    ).rejects.toThrow(/does not support video \/ audio prompt parts/)
  })

  it('requires prompt text even when editing', async () => {
    const fetchMock = mockFetch(() => jsonResponse(successBody))
    await expect(
      adapterWithFetch(fetchMock).generateImages({
        model: 'seedream-4-0-250828',
        prompt: [imagePart('https://example.com/guitar.png')],
        logger: testLogger,
      }),
    ).rejects.toThrow(/requires prompt text/)
  })

  it('rejects a prompt longer than 600 words', async () => {
    const fetchMock = mockFetch(() => jsonResponse(successBody))
    await expect(
      adapterWithFetch(fetchMock).generateImages({
        model: 'seedream-4-0-250828',
        prompt: Array.from({ length: 601 }, () => 'guitar').join(' '),
        logger: testLogger,
      }),
    ).rejects.toThrow(/601 words/)
  })

  it('passes watermark and output_format straight through', async () => {
    const fetchMock = mockFetch(() => jsonResponse(successBody))
    await adapterWithFetch(
      fetchMock,
      'seedream-5-0-lite-260128',
    ).generateImages({
      model: 'seedream-5-0-lite-260128',
      prompt: 'a guitar',
      modelOptions: {
        watermark: false,
        output_format: 'png',
        response_format: 'b64_json',
      },
      logger: testLogger,
    })

    expect(sentRequest(fetchMock)).toMatchObject({
      watermark: false,
      output_format: 'png',
      response_format: 'b64_json',
    })
  })

  it('sends output_format on a 4.x model rather than rejecting it locally', async () => {
    const fetchMock = mockFetch(() => jsonResponse(successBody))
    // Seedream 4.x is documented as not reading output_format, so it is absent
    // from that model's provider-options type. A caller who reuses a 5.0
    // options object still gets the value sent — Ark decides, not us. Same
    // policy as sequential_image_generation.
    const fiveOhOptions: BytePlusSeedream5ImageProviderOptions = {
      output_format: 'png',
    }
    await adapterWithFetch(fetchMock).generateImages({
      model: 'seedream-4-0-250828',
      prompt: 'a guitar',
      modelOptions: fiveOhOptions,
      logger: testLogger,
    })

    expect(sentRequest(fetchMock).output_format).toBe('png')
  })
})

describe('numberOfImages', () => {
  it('sends no group-image fields for a single image', async () => {
    const fetchMock = mockFetch(() => jsonResponse(successBody))
    await adapterWithFetch(fetchMock).generateImages({
      model: 'seedream-4-0-250828',
      prompt: 'a guitar',
      numberOfImages: 1,
      logger: testLogger,
    })

    const request = sentRequest(fetchMock)
    expect(request.sequential_image_generation).toBeUndefined()
    expect(request.sequential_image_generation_options).toBeUndefined()
  })

  it('maps more than one image onto group-image mode', async () => {
    const fetchMock = mockFetch(() => jsonResponse(successBody))
    await adapterWithFetch(fetchMock).generateImages({
      model: 'seedream-4-0-250828',
      prompt: 'four seasons of one courtyard',
      numberOfImages: 4,
      logger: testLogger,
    })

    expect(sentRequest(fetchMock)).toMatchObject({
      sequential_image_generation: 'auto',
      sequential_image_generation_options: { max_images: 4 },
    })
  })

  it('lets explicit provider options override the derived mode', async () => {
    const fetchMock = mockFetch(() => jsonResponse(successBody))
    await adapterWithFetch(fetchMock).generateImages({
      model: 'seedream-4-0-250828',
      prompt: 'a guitar',
      numberOfImages: 4,
      modelOptions: { sequential_image_generation: 'disabled' },
      logger: testLogger,
    })
    expect(sentRequest(fetchMock).sequential_image_generation).toBe('disabled')
  })

  it('rejects counts outside the group-image range', async () => {
    const fetchMock = mockFetch(() => jsonResponse(successBody))
    await expect(
      adapterWithFetch(fetchMock).generateImages({
        model: 'seedream-4-0-250828',
        prompt: 'a guitar',
        numberOfImages: 16,
        logger: testLogger,
      }),
    ).rejects.toThrow(/between 1 and 15/)
  })
})

describe('response mapping', () => {
  it('maps url results and per-image usage', async () => {
    const fetchMock = mockFetch(() => jsonResponse(successBody))
    const result = await adapterWithFetch(fetchMock).generateImages({
      model: 'seedream-4-0-250828',
      prompt: 'a guitar',
      logger: testLogger,
    })

    expect(result.model).toBe('seedream-4-0-250828')
    expect(result.id).toMatch(/^byteplus-/)
    expect(result.images).toEqual([{ url: IMAGE_URL }])
    expect(result.usage).toEqual({
      promptTokens: 0,
      completionTokens: 3888,
      totalTokens: 3888,
      billed: { quantity: 1, unit: 'images' },
      unitsBilled: 1,
    })
  })

  it('maps b64_json results', async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse({
        model: 'seedream-4-0-250828',
        data: [{ b64_json: 'QUJD', size: '1024x1024' }],
      }),
    )
    const result = await adapterWithFetch(fetchMock).generateImages({
      model: 'seedream-4-0-250828',
      prompt: 'a guitar',
      modelOptions: { response_format: 'b64_json' },
      logger: testLogger,
    })

    expect(result.images).toEqual([{ b64Json: 'QUJD' }])
    expect(result.usage).toBeUndefined()
  })

  it('maps every image of a group-image response', async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse({
        model: 'seedream-4-0-250828',
        data: [{ url: 'https://example.com/1.png' }, { b64_json: 'QUJD' }],
        usage: { generated_images: 2, output_tokens: 100, total_tokens: 100 },
      }),
    )
    const result = await adapterWithFetch(fetchMock).generateImages({
      model: 'seedream-4-0-250828',
      prompt: 'a guitar',
      numberOfImages: 2,
      logger: testLogger,
    })

    expect(result.images).toEqual([
      { url: 'https://example.com/1.png' },
      { b64Json: 'QUJD' },
    ])
    expect(result.usage?.unitsBilled).toBe(2)
    expect(result.usage?.billed).toEqual({ quantity: 2, unit: 'images' })
  })

  it('keeps the successes when part of a group fails, and reports the rest', async () => {
    const { spy, logger } = capturingLogger()
    const fetchMock = mockFetch(() =>
      jsonResponse({
        model: 'seedream-4-0-250828',
        data: [
          { url: 'https://example.com/1.png', size: '1024x1024' },
          {
            error: {
              code: 'OutputImageSensitiveContentDetected',
              message: 'The output image may contain sensitive information.',
            },
          },
          { error: { code: 'InternalServiceError', message: 'try again' } },
        ],
        usage: { generated_images: 1, output_tokens: 1000, total_tokens: 1000 },
      }),
    )

    const result = await adapterWithFetch(fetchMock).generateImages({
      model: 'seedream-4-0-250828',
      prompt: 'four seasons of one courtyard',
      numberOfImages: 4,
      logger,
    })

    // The one good image survives rather than the whole call failing.
    expect(result.images).toEqual([{ url: 'https://example.com/1.png' }])

    // The two failures are reported with their provider codes.
    const errorLog = messages(spy.error)
    expect(errorLog).toContain('dropped 2 failed image(s)')
    expect(errorLog).toContain('OutputImageSensitiveContentDetected')
    expect(errorLog).toContain('InternalServiceError')

    // And the shortfall against numberOfImages is surfaced separately.
    expect(messages(spy.warn)).toContain('requested 4 images, received 1')
  })

  it('warns when the model returns fewer images than requested', async () => {
    const { spy, logger } = capturingLogger()
    const fetchMock = mockFetch(() =>
      jsonResponse({
        model: 'seedream-4-0-250828',
        data: [{ url: 'https://example.com/1.png' }],
        usage: { generated_images: 1, output_tokens: 10, total_tokens: 10 },
      }),
    )

    await adapterWithFetch(fetchMock).generateImages({
      model: 'seedream-4-0-250828',
      prompt: 'a guitar',
      numberOfImages: 3,
      logger,
    })

    // No per-image failure here — just a model that decided one was enough.
    expect(spy.error).not.toHaveBeenCalled()
    expect(messages(spy.warn)).toContain('requested 3 images, received 1')
  })

  it('does not warn when the count is met', async () => {
    const { spy, logger } = capturingLogger()
    const fetchMock = mockFetch(() => jsonResponse(successBody))
    await adapterWithFetch(fetchMock).generateImages({
      model: 'seedream-4-0-250828',
      prompt: 'a guitar',
      numberOfImages: 1,
      logger,
    })
    expect(spy.warn).not.toHaveBeenCalled()
  })

  it('surfaces per-image codes when every image fails', async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse({
        model: 'seedream-4-0-250828',
        data: [
          { error: { code: 'OutputImageSensitiveContentDetected' } },
          { error: { code: 'InternalServiceError', message: 'try again' } },
        ],
      }),
    )
    await expect(
      adapterWithFetch(fetchMock).generateImages({
        model: 'seedream-4-0-250828',
        prompt: 'a guitar',
        numberOfImages: 2,
        logger: testLogger,
      }),
    ).rejects.toThrow(
      /returned no images: OutputImageSensitiveContentDetected; InternalServiceError: try again/,
    )
  })

  // Ark's OpenAPI document describes a second, nested `data[]` item form, so
  // an item matching none of b64_json / url / error is a live possibility. It
  // used to be dropped without even being counted, which turned provider drift
  // into a bare "returned no images" with nothing to act on.
  it('reports unrecognized data items rather than dropping them', async () => {
    const { spy, logger } = capturingLogger()
    const fetchMock = mockFetch(() =>
      jsonResponse({
        model: 'seedream-4-0-250828',
        data: [{ imagecontent: [{ image_url: 'https://example.com/1.png' }] }],
      }),
    )

    await expect(
      adapterWithFetch(fetchMock).generateImages({
        model: 'seedream-4-0-250828',
        prompt: 'a guitar',
        logger,
      }),
    ).rejects.toThrow(/1 unrecognized response item/)
    expect(messages(spy.error)).toContain(
      'matched none of b64_json / url / error',
    )
  })

  it('carries the raw body into the unrecognized-item error', async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse({
        model: 'seedream-4-0-250828',
        data: [{ imagecontent: [{ image_url: 'https://example.com/1.png' }] }],
      }),
    )

    await expect(
      adapterWithFetch(fetchMock).generateImages({
        model: 'seedream-4-0-250828',
        prompt: 'a guitar',
        logger: testLogger,
      }),
    ).rejects.toThrow(/imagecontent/)
  })

  // `readJsonBody` returns the raw text for a non-JSON body — an HTML error
  // page from a proxy in front of the API, served with a 200.
  it.each([
    ['an empty body', new Response('', { status: 200 })],
    [
      'an HTML page',
      new Response('<html>502 Bad Gateway</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    ],
  ])('throws with the body in hand for %s', async (_label, response) => {
    await expect(
      adapterWithFetch(mockFetch(() => response)).generateImages({
        model: 'seedream-4-0-250828',
        prompt: 'a guitar',
        logger: testLogger,
      }),
    ).rejects.toThrow(/non-object body/)
  })

  // A partial group failure returns successfully with a short array. The
  // `numberOfImages` warning only fires when the count was set explicitly, so
  // without this one a caller who omitted it gets no signal at all.
  it('warns on a partial failure even when numberOfImages is unset', async () => {
    const { spy, logger } = capturingLogger()
    const fetchMock = mockFetch(() =>
      jsonResponse({
        model: 'seedream-4-0-250828',
        data: [
          { url: 'https://example.com/1.png' },
          { error: { code: 'InternalServiceError', message: 'try again' } },
        ],
        usage: { generated_images: 1, output_tokens: 10, total_tokens: 10 },
      }),
    )

    const result = await adapterWithFetch(fetchMock).generateImages({
      model: 'seedream-4-0-250828',
      prompt: 'a guitar',
      logger,
    })

    expect(result.images).toHaveLength(1)
    expect(messages(spy.warn)).toContain('1 of 2 images failed to generate')
  })

  it('throws with the response error when no image comes back', async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse({
        model: 'seedream-4-0-250828',
        data: [],
        error: {
          code: 'OutputImageSensitiveContentDetected',
          message:
            'The request failed because the output image may contain sensitive information.',
        },
      }),
    )
    await expect(
      adapterWithFetch(fetchMock).generateImages({
        model: 'seedream-4-0-250828',
        prompt: 'a guitar',
        logger: testLogger,
      }),
    ).rejects.toThrow(
      /returned no images: OutputImageSensitiveContentDetected: The request failed/,
    )
  })
})

describe('error handling', () => {
  it('surfaces the Ark error envelope', async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse(
        {
          error: {
            code: 'InputTextSensitiveContentDetected',
            message:
              'The request failed because the input text may contain sensitive information.',
          },
        },
        400,
      ),
    )
    await expect(
      adapterWithFetch(fetchMock).generateImages({
        model: 'seedream-4-0-250828',
        prompt: 'a guitar',
        logger: testLogger,
      }),
    ).rejects.toThrow(
      /BytePlus Ark image generation failed \(400 InputTextSensitiveContentDetected\)/,
    )
  })

  it('logs the failure through logger.errors before rethrowing', async () => {
    const { spy, logger } = capturingLogger()
    const fetchMock = mockFetch(() =>
      jsonResponse(
        { error: { code: 'QuotaExceeded', message: 'slow down' } },
        429,
      ),
    )

    await expect(
      adapterWithFetch(fetchMock).generateImages({
        model: 'seedream-4-0-250828',
        prompt: 'a guitar',
        logger,
      }),
    ).rejects.toThrow(/QuotaExceeded/)

    expect(messages(spy.error)).toContain('byteplus.generateImages fatal')
    const meta = spy.error.mock.calls[0]?.[1]
    expect(meta).toMatchObject({ source: 'byteplus.generateImages' })
  })

  it('falls back to the raw body for a non-JSON failure', async () => {
    const fetchMock = mockFetch(
      () =>
        new Response('<html>Bad Gateway</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
    )
    await expect(
      adapterWithFetch(fetchMock).generateImages({
        model: 'seedream-4-0-250828',
        prompt: 'a guitar',
        logger: testLogger,
      }),
    ).rejects.toThrow(/failed \(502\): <html>Bad Gateway<\/html>/)
  })
})

describe('core generateImage() integration', () => {
  it('drives the adapter through the core entry point', async () => {
    const fetchMock = mockFetch(() => jsonResponse(successBody))
    const result = await generateImage({
      adapter: adapterWithFetch(fetchMock),
      // Reference images are part of the prompt at the call site: the
      // adapter's modality map has to admit image parts for this to compile.
      prompt: [
        { type: 'text', content: 'put this guitar on a beach' },
        imagePart('https://example.com/guitar.png'),
      ],
      size: '2K',
      modelOptions: { watermark: false },
      debug: false,
    })

    expect(result.images).toEqual([{ url: IMAGE_URL }])
    expect(sentRequest(fetchMock)).toMatchObject({
      model: 'seedream-4-0-250828',
      size: '2K',
      watermark: false,
      image: ['https://example.com/guitar.png'],
    })
  })
})

describe('parseBytePlusImageSize', () => {
  it('accepts the documented forms', () => {
    expect(parseBytePlusImageSize('1K')).toEqual({ kind: 'token', value: '1K' })
    expect(parseBytePlusImageSize('4k')).toEqual({ kind: 'token', value: '4K' })
    expect(parseBytePlusImageSize('2048x2048')).toEqual({
      kind: 'pixels',
      width: 2048,
      height: 2048,
    })
  })

  it('rejects everything else', () => {
    for (const invalid of [
      '3K',
      '2K_1024',
      '1024',
      '1024x',
      '0x1024',
      '',
      // Internal whitespace is not a documented form.
      '2048 x 2048',
      '2048x 2048',
      // The docs render the separator as U+00D7, which the API rejects.
      '2048×2048',
      // Mixing the two forms.
      '2K x 1024',
    ]) {
      expect(parseBytePlusImageSize(invalid)).toBeUndefined()
    }
  })

  it('still trims surrounding whitespace', () => {
    expect(parseBytePlusImageSize('  2K  ')).toEqual({
      kind: 'token',
      value: '2K',
    })
    expect(parseBytePlusImageSize(' 2048x2048 ')).toEqual({
      kind: 'pixels',
      width: 2048,
      height: 2048,
    })
  })
})
