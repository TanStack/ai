import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import {
  mapImageInputsToFalFields,
  mapImageInputsToFalVideoFields,
} from '../src/image/image-inputs'
import { FAL_ENDPOINTS_DTS_SHA256 } from '../src/image/generated/image-field-overrides'
import type { ImagePart, MediaInputMetadata } from '@tanstack/ai'

/** A model id unknown to the SDK — exercises the default field mapping. */
const UNKNOWN_MODEL = 'custom-org/not-in-sdk'

function urlPart(
  value: string,
  metadata?: MediaInputMetadata,
): ImagePart<MediaInputMetadata> {
  return {
    type: 'image',
    source: { type: 'url', value },
    ...(metadata && { metadata }),
  }
}

describe('mapImageInputsToFalFields', () => {
  it('returns an empty object when imageInputs is missing or empty', () => {
    expect(mapImageInputsToFalFields(UNKNOWN_MODEL, undefined)).toEqual({})
    expect(mapImageInputsToFalFields(UNKNOWN_MODEL, [])).toEqual({})
  })

  it('routes a single source to image_url', () => {
    expect(
      mapImageInputsToFalFields(UNKNOWN_MODEL, [
        urlPart('https://example.com/a.png'),
      ]),
    ).toEqual({ image_url: 'https://example.com/a.png' })
  })

  it('routes multiple sources to image_urls', () => {
    expect(
      mapImageInputsToFalFields(UNKNOWN_MODEL, [
        urlPart('https://example.com/a.png'),
        urlPart('https://example.com/b.png'),
      ]),
    ).toEqual({
      image_urls: ['https://example.com/a.png', 'https://example.com/b.png'],
    })
  })

  it('routes role=mask to mask_url alongside the source image_url', () => {
    expect(
      mapImageInputsToFalFields(UNKNOWN_MODEL, [
        urlPart('https://example.com/img.png'),
        urlPart('https://example.com/mask.png', { role: 'mask' }),
      ]),
    ).toEqual({
      image_url: 'https://example.com/img.png',
      mask_url: 'https://example.com/mask.png',
    })
  })

  it('routes role=reference to reference_image_urls', () => {
    expect(
      mapImageInputsToFalFields(UNKNOWN_MODEL, [
        urlPart('https://example.com/product.png'),
        urlPart('https://example.com/style.png', { role: 'reference' }),
        urlPart('https://example.com/character.png', { role: 'character' }),
      ]),
    ).toEqual({
      image_url: 'https://example.com/product.png',
      reference_image_urls: [
        'https://example.com/style.png',
        'https://example.com/character.png',
      ],
    })
  })

  it('routes role=control to control_image_url', () => {
    expect(
      mapImageInputsToFalFields(UNKNOWN_MODEL, [
        urlPart('https://example.com/img.png'),
        urlPart('https://example.com/depth.png', { role: 'control' }),
      ]),
    ).toEqual({
      image_url: 'https://example.com/img.png',
      control_image_url: 'https://example.com/depth.png',
    })
  })

  it('encodes data sources as data URIs', () => {
    expect(
      mapImageInputsToFalFields(UNKNOWN_MODEL, [
        {
          type: 'image',
          source: { type: 'data', value: 'aGVsbG8=', mimeType: 'image/png' },
        },
      ]),
    ).toEqual({ image_url: 'data:image/png;base64,aGVsbG8=' })
  })

  it('throws when more than one mask is provided', () => {
    expect(() =>
      mapImageInputsToFalFields(UNKNOWN_MODEL, [
        urlPart('https://example.com/m1.png', { role: 'mask' }),
        urlPart('https://example.com/m2.png', { role: 'mask' }),
      ]),
    ).toThrow(/only one input with metadata.role === 'mask'/)
  })

  describe('generated endpoint overrides', () => {
    it('routes a single source to image_urls on endpoints without a scalar field', () => {
      // nano-banana edit has image_urls but no image_url
      expect(
        mapImageInputsToFalFields('fal-ai/nano-banana/edit', [
          urlPart('https://example.com/a.png'),
        ]),
      ).toEqual({ image_urls: ['https://example.com/a.png'] })
    })

    it('merges sources and references when both resolve to the same list field', () => {
      expect(
        mapImageInputsToFalFields('fal-ai/nano-banana/edit', [
          urlPart('https://example.com/product.png'),
          urlPart('https://example.com/style.png', { role: 'reference' }),
        ]),
      ).toEqual({
        image_urls: [
          'https://example.com/product.png',
          'https://example.com/style.png',
        ],
      })
    })

    it('routes role=mask to endpoint-specific mask field names', () => {
      // gpt-image-1.5 edit uses mask_image_url instead of mask_url
      expect(
        mapImageInputsToFalFields('fal-ai/gpt-image-1.5/edit', [
          urlPart('https://example.com/img.png'),
          urlPart('https://example.com/mask.png', { role: 'mask' }),
        ]),
      ).toEqual({
        image_urls: ['https://example.com/img.png'],
        mask_image_url: 'https://example.com/mask.png',
      })
    })
  })
})

describe('mapImageInputsToFalVideoFields', () => {
  it('returns empty for missing/empty inputs', () => {
    expect(mapImageInputsToFalVideoFields(UNKNOWN_MODEL, undefined)).toEqual({})
    expect(mapImageInputsToFalVideoFields(UNKNOWN_MODEL, [])).toEqual({})
  })

  it('routes a single positional source to image_url (start frame)', () => {
    expect(
      mapImageInputsToFalVideoFields(UNKNOWN_MODEL, [
        urlPart('https://example.com/start.png'),
      ]),
    ).toEqual({ image_url: 'https://example.com/start.png' })
  })

  it('routes role=start_frame to start_image_url and role=end_frame to end_image_url', () => {
    expect(
      mapImageInputsToFalVideoFields(UNKNOWN_MODEL, [
        urlPart('https://example.com/a.png', { role: 'start_frame' }),
        urlPart('https://example.com/z.png', { role: 'end_frame' }),
      ]),
    ).toEqual({
      start_image_url: 'https://example.com/a.png',
      end_image_url: 'https://example.com/z.png',
    })
  })

  it('routes role=reference to reference_image_urls', () => {
    expect(
      mapImageInputsToFalVideoFields(UNKNOWN_MODEL, [
        urlPart('https://example.com/start.png'),
        urlPart('https://example.com/character.png', { role: 'reference' }),
      ]),
    ).toEqual({
      image_url: 'https://example.com/start.png',
      reference_image_urls: ['https://example.com/character.png'],
    })
  })

  describe('generated endpoint overrides', () => {
    it('routes role=start_frame to the source field on image-to-video endpoints', () => {
      // Kling i2v takes the start frame as plain image_url, the end frame
      // as tail_image_url
      expect(
        mapImageInputsToFalVideoFields(
          'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
          [
            urlPart('https://example.com/start.png', { role: 'start_frame' }),
            urlPart('https://example.com/end.png', { role: 'end_frame' }),
          ],
        ),
      ).toEqual({
        image_url: 'https://example.com/start.png',
        tail_image_url: 'https://example.com/end.png',
      })
    })

    it('routes frame roles to first/last frame fields on frame-to-video endpoints', () => {
      expect(
        mapImageInputsToFalVideoFields(
          'fal-ai/veo3.1/first-last-frame-to-video',
          [
            urlPart('https://example.com/first.png', { role: 'start_frame' }),
            urlPart('https://example.com/last.png', { role: 'end_frame' }),
          ],
        ),
      ).toEqual({
        first_frame_url: 'https://example.com/first.png',
        last_frame_url: 'https://example.com/last.png',
      })
    })

    it('throws when a source and start_frame both resolve to the same scalar field', () => {
      expect(() =>
        mapImageInputsToFalVideoFields(
          'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
          [
            urlPart('https://example.com/source.png'),
            urlPart('https://example.com/start.png', { role: 'start_frame' }),
          ],
        ),
      ).toThrow(/multiple inputs map to 'image_url'/)
    })
  })
})

describe('generated image-field-overrides artifact', () => {
  it('matches the installed @fal-ai/client endpoint types', () => {
    const require = createRequire(import.meta.url)
    const endpointsJs = require.resolve('@fal-ai/client/endpoints')
    const endpointsDts = endpointsJs.replace(/\.js$/, '.d.ts')
    const hash = createHash('sha256')
      .update(readFileSync(endpointsDts))
      .digest('hex')
    expect(
      hash,
      'image-field-overrides.ts is stale for the installed @fal-ai/client. Run: pnpm generate:fal-image-fields',
    ).toBe(FAL_ENDPOINTS_DTS_SHA256)
  })
})
