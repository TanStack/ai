// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  zCreateModerationRequest,
  zCreateModerationResponse,
} from './zod.gen.js'

/**
 * Map of openai-moderation endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const openaiModerationEndpointZodMap: {
  readonly moderations: {
    readonly input: typeof zCreateModerationRequest
    readonly output: typeof zCreateModerationResponse
  }
} = {
  moderations: {
    input: zCreateModerationRequest,
    output: zCreateModerationResponse,
  },
}

/** Union of valid openai-moderation endpoint ids. */
export type OpenaiModerationEndpointId =
  keyof typeof openaiModerationEndpointZodMap
