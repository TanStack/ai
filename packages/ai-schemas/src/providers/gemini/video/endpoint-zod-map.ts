// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import { zOperation, zPredictLongRunningRequest } from './zod.gen.js'

/**
 * Map of gemini-video endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const geminiVideoEndpointZodMap: {
  readonly 'v1beta/models/{modelsId}:predictLongRunning': {
    readonly input: typeof zPredictLongRunningRequest
    readonly output: typeof zOperation
  }
} = {
  'v1beta/models/{modelsId}:predictLongRunning': {
    input: zPredictLongRunningRequest,
    output: zOperation,
  },
}

/** Union of valid gemini-video endpoint ids. */
export type GeminiVideoEndpointId = keyof typeof geminiVideoEndpointZodMap
