// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  zCreateSpeechRequest,
  zCreateTranscriptionRequest,
  zCreateTranslationRequest,
  zCreateVoiceConsentRequest,
  zCreateVoiceRequest,
  zUpdateVoiceConsentRequest,
  zVoiceConsentResource,
  zVoiceResource,
} from './zod.gen.js'

/**
 * Map of openai-audio endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const openaiAudioEndpointZodMap: {
  readonly 'audio/speech': { readonly input: typeof zCreateSpeechRequest }
  readonly 'audio/transcriptions': {
    readonly input: typeof zCreateTranscriptionRequest
  }
  readonly 'audio/translations': {
    readonly input: typeof zCreateTranslationRequest
  }
  readonly 'audio/voice_consents': {
    readonly input: typeof zCreateVoiceConsentRequest
    readonly output: typeof zVoiceConsentResource
  }
  readonly 'audio/voice_consents/{consent_id}': {
    readonly input: typeof zUpdateVoiceConsentRequest
    readonly output: typeof zVoiceConsentResource
  }
  readonly 'audio/voices': {
    readonly input: typeof zCreateVoiceRequest
    readonly output: typeof zVoiceResource
  }
} = {
  'audio/speech': { input: zCreateSpeechRequest },
  'audio/transcriptions': { input: zCreateTranscriptionRequest },
  'audio/translations': { input: zCreateTranslationRequest },
  'audio/voice_consents': {
    input: zCreateVoiceConsentRequest,
    output: zVoiceConsentResource,
  },
  'audio/voice_consents/{consent_id}': {
    input: zUpdateVoiceConsentRequest,
    output: zVoiceConsentResource,
  },
  'audio/voices': { input: zCreateVoiceRequest, output: zVoiceResource },
}

/** Union of valid openai-audio endpoint ids. */
export type OpenaiAudioEndpointId = keyof typeof openaiAudioEndpointZodMap
