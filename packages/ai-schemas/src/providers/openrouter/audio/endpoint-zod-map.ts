// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import { zSpeechRequest, zSttRequest, zSttResponse } from './zod.gen.js'

/**
 * Map of openrouter-audio endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const openrouterAudioEndpointZodMap: {
  readonly 'audio/speech': { readonly input: typeof zSpeechRequest }
  readonly 'audio/transcriptions': {
    readonly input: typeof zSttRequest
    readonly output: typeof zSttResponse
  }
} = {
  'audio/speech': { input: zSpeechRequest },
  'audio/transcriptions': { input: zSttRequest, output: zSttResponse },
}

/** Union of valid openrouter-audio endpoint ids. */
export type OpenrouterAudioEndpointId =
  keyof typeof openrouterAudioEndpointZodMap
