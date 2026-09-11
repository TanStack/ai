import type {
  AiModels,
  BaseAiAutomaticSpeechRecognition,
  BaseAiTextEmbeddings,
  BaseAiTextGeneration,
  BaseAiTextToImage,
  BaseAiTextToSpeech,
} from '@cloudflare/workers-types'

/** Model ids from the Workers AI catalog whose task shape matches `TTask`. */
type ModelsFor<TTask> = {
  [K in keyof AiModels]: AiModels[K] extends TTask ? K : never
}[keyof AiModels]

/**
 * Chat model id. Catalog ids get autocomplete; any other id works too,
 * including third-party `provider/model` ids routed through AI Gateway
 * (for example `openai/gpt-5.5`).
 */
export type CloudflareTextModel =
  | ModelsFor<BaseAiTextGeneration>
  | (string & {})

export type CloudflareEmbeddingModel =
  | ModelsFor<BaseAiTextEmbeddings>
  | (string & {})

export type CloudflareImageModel = ModelsFor<BaseAiTextToImage> | (string & {})

export type CloudflareTTSModel =
  | ModelsFor<BaseAiTextToSpeech>
  | '@cf/deepgram/aura-1'
  | '@cf/deepgram/aura-2-en'
  | '@cf/deepgram/aura-2-es'
  | (string & {})

export type CloudflareTranscriptionModel =
  | ModelsFor<BaseAiAutomaticSpeechRecognition>
  | '@cf/openai/whisper-large-v3-turbo'
  | '@cf/deepgram/nova-3'
  | (string & {})
