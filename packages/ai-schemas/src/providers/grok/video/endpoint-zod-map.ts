// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  zEditVideoRequest,
  zExtendVideoRequest,
  zGenerateVideoRequest,
  zStartDeferredResponse,
} from './zod.gen.js'

/**
 * Map of grok-video endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const grokVideoEndpointZodMap: {
  readonly 'v1/videos/edits': {
    readonly input: typeof zEditVideoRequest
    readonly output: typeof zStartDeferredResponse
  }
  readonly 'v1/videos/extensions': {
    readonly input: typeof zExtendVideoRequest
    readonly output: typeof zStartDeferredResponse
  }
  readonly 'v1/videos/generations': {
    readonly input: typeof zGenerateVideoRequest
    readonly output: typeof zStartDeferredResponse
  }
} = {
  'v1/videos/edits': {
    input: zEditVideoRequest,
    output: zStartDeferredResponse,
  },
  'v1/videos/extensions': {
    input: zExtendVideoRequest,
    output: zStartDeferredResponse,
  },
  'v1/videos/generations': {
    input: zGenerateVideoRequest,
    output: zStartDeferredResponse,
  },
}

/** Union of valid grok-video endpoint ids. */
export type GrokVideoEndpointId = keyof typeof grokVideoEndpointZodMap
