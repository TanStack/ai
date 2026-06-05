// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  zCreateImageRequest,
  zCreateImageVariationRequest,
  zEditImageBodyJsonParam,
  zImagesResponse,
} from './zod.gen.js'

/**
 * Map of openai-image endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const openaiImageEndpointZodMap: {
  readonly 'images/edits': {
    readonly input: typeof zEditImageBodyJsonParam
    readonly output: typeof zImagesResponse
  }
  readonly 'images/generations': {
    readonly input: typeof zCreateImageRequest
    readonly output: typeof zImagesResponse
  }
  readonly 'images/variations': {
    readonly input: typeof zCreateImageVariationRequest
    readonly output: typeof zImagesResponse
  }
} = {
  'images/edits': { input: zEditImageBodyJsonParam, output: zImagesResponse },
  'images/generations': { input: zCreateImageRequest, output: zImagesResponse },
  'images/variations': {
    input: zCreateImageVariationRequest,
    output: zImagesResponse,
  },
}

/** Union of valid openai-image endpoint ids. */
export type OpenaiImageEndpointId = keyof typeof openaiImageEndpointZodMap
