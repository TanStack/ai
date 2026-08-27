import type {
  MediaResolution,
  SafetySetting,
  Schema,
  ThinkingLevel,
  ToolConfig,
} from '@google/genai'

export interface GeminiToolConfigOptions {
  toolConfig?: ToolConfig
}

export interface GeminiSafetyOptions {
  safetySettings?: Array<SafetySetting>
}

export interface GeminiCommonConfigOptions {
  stopSequences?: Array<string>
  responseModalities?: Array<
    'MODALITY_UNSPECIFIED' | 'TEXT' | 'IMAGE' | 'AUDIO'
  >
  candidateCount?: number
  topK?: number
  /** Controls randomness, range [0.0, 2.0]. Higher = more random. Use this or topP, not both. */
  temperature?: number
  /** Nucleus sampling probability mass, range (0.0, 1.0]. */
  topP?: number
  /** Maximum number of tokens to generate in the response. */
  maxOutputTokens?: number
  seed?: number
  presencePenalty?: number
  frequencyPenalty?: number
  responseLogprobs?: boolean

  logprobs?: number

  enableEnhancedCivicAnswers?: boolean

  speechConfig?: {
    voiceConfig: {
      prebuiltVoiceConfig: {
        voiceName: string
      }
    }

    multiSpeakerVoiceConfig?: {
      speakerVoiceConfigs?: Array<{
        speaker: string
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: string
          }
        }
      }>
    }
    languageCode?:
      | 'de-DE'
      | 'en-AU'
      | 'en-GB'
      | 'en-IN'
      | 'en-US'
      | 'es-US'
      | 'fr-FR'
      | 'hi-IN'
      | 'pt-BR'
      | 'ar-XA'
      | 'es-ES'
      | 'fr-CA'
      | 'id-ID'
      | 'it-IT'
      | 'ja-JP'
      | 'tr-TR'
      | 'vi-VN'
      | 'bn-IN'
      | 'gu-IN'
      | 'kn-IN'
      | 'ml-IN'
      | 'mr-IN'
      | 'ta-IN'
      | 'te-IN'
      | 'nl-NL'
      | 'ko-KR'
      | 'cmn-CN'
      | 'pl-PL'
      | 'ru-RU'
      | 'th-TH'
  }
  imageConfig?: {
    aspectRatio?:
      | '1:1'
      | '2:3'
      | '3:2'
      | '3:4'
      | '4:3'
      | '9:16'
      | '16:9'
      | '21:9'
  }
  mediaResolution?: MediaResolution
}

export interface GeminiCachedContentOptions {
  cachedContent?: `cachedContents/${string}`
}

export interface GeminiStructuredOutputOptions {
  responseMimeType?: string
  responseSchema?: Schema
  responseJsonSchema?: Schema
}

export interface GeminiThinkingOptions {
  thinkingConfig?: {
    includeThoughts?: boolean

    thinkingBudget?: number

    thinkingLevel?: keyof typeof ThinkingLevel
  }
}

export type ExternalTextProviderOptions = GeminiToolConfigOptions &
  GeminiSafetyOptions &
  GeminiCommonConfigOptions &
  GeminiCachedContentOptions &
  GeminiThinkingOptions &
  GeminiStructuredOutputOptions
