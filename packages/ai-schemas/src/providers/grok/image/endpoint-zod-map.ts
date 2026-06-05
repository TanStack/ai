// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  zEditImageRequest,
  zGenerateImageRequest,
  zGeneratedImageResponse,
} from './zod.gen.js'

/**
 * Map of grok-image endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const grokImageEndpointZodMap: {
  readonly 'v1/images/edits': {
    readonly input: typeof zEditImageRequest
    readonly output: typeof zGeneratedImageResponse
  }
  readonly 'v1/images/generations': {
    readonly input: typeof zGenerateImageRequest
    readonly output: typeof zGeneratedImageResponse
  }
} = {
  'v1/images/edits': {
    input: zEditImageRequest,
    output: zGeneratedImageResponse,
  },
  'v1/images/generations': {
    input: zGenerateImageRequest,
    output: zGeneratedImageResponse,
  },
}

/** Union of valid grok-image endpoint ids. */
export type GrokImageEndpointId = keyof typeof grokImageEndpointZodMap
