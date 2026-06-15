// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import { zPredictRequest, zPredictResponse } from './zod.gen.js'

/**
 * Map of gemini-image endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const geminiImageEndpointZodMap: {
  readonly 'v1beta/models/{modelsId}:predict': {
    readonly input: typeof zPredictRequest
    readonly output: typeof zPredictResponse
  }
} = {
  'v1beta/models/{modelsId}:predict': {
    input: zPredictRequest,
    output: zPredictResponse,
  },
}

/** Union of valid gemini-image endpoint ids. */
export type GeminiImageEndpointId = keyof typeof geminiImageEndpointZodMap
