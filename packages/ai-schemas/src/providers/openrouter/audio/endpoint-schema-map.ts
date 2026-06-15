// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  STTRequestSchema,
  STTResponseSchema,
  SpeechRequestSchema,
} from './schemas.gen.js'

/**
 * Map of openrouter-audio endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const openrouterAudioEndpointSchemaMap: {
  readonly 'audio/speech': { readonly input: typeof SpeechRequestSchema }
  readonly 'audio/transcriptions': {
    readonly input: typeof STTRequestSchema
    readonly output: typeof STTResponseSchema
  }
} = {
  'audio/speech': { input: SpeechRequestSchema },
  'audio/transcriptions': {
    input: STTRequestSchema,
    output: STTResponseSchema,
  },
}
