// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  CreateSpeechRequestSchema,
  CreateTranscriptionRequestSchema,
  CreateTranslationRequestSchema,
  CreateVoiceConsentRequestSchema,
  CreateVoiceRequestSchema,
  UpdateVoiceConsentRequestSchema,
  VoiceConsentResourceSchema,
  VoiceResourceSchema,
} from './schemas.gen.js'

/**
 * Map of openai-audio endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const openaiAudioEndpointSchemaMap: {
  readonly 'audio/speech': { readonly input: typeof CreateSpeechRequestSchema }
  readonly 'audio/transcriptions': {
    readonly input: typeof CreateTranscriptionRequestSchema
  }
  readonly 'audio/translations': {
    readonly input: typeof CreateTranslationRequestSchema
  }
  readonly 'audio/voice_consents': {
    readonly input: typeof CreateVoiceConsentRequestSchema
    readonly output: typeof VoiceConsentResourceSchema
  }
  readonly 'audio/voice_consents/{consent_id}': {
    readonly input: typeof UpdateVoiceConsentRequestSchema
    readonly output: typeof VoiceConsentResourceSchema
  }
  readonly 'audio/voices': {
    readonly input: typeof CreateVoiceRequestSchema
    readonly output: typeof VoiceResourceSchema
  }
} = {
  'audio/speech': { input: CreateSpeechRequestSchema },
  'audio/transcriptions': { input: CreateTranscriptionRequestSchema },
  'audio/translations': { input: CreateTranslationRequestSchema },
  'audio/voice_consents': {
    input: CreateVoiceConsentRequestSchema,
    output: VoiceConsentResourceSchema,
  },
  'audio/voice_consents/{consent_id}': {
    input: UpdateVoiceConsentRequestSchema,
    output: VoiceConsentResourceSchema,
  },
  'audio/voices': {
    input: CreateVoiceRequestSchema,
    output: VoiceResourceSchema,
  },
}
