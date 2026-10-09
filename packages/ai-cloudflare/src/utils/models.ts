import type { ModelReasoning } from '@tanstack/ai'
import type { ModelReasoningCapability } from '@tanstack/ai/adapter-internals'
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

/**
 * Evaluate model id. TypeSafe Jev on Workers AI is `typesafe/jev`.
 * Any other id works too.
 */
export type CloudflareEvaluateModel = 'typesafe/jev' | (string & {})

// Reasoning
//
// Each model's data for `chat({ reasoning })`: the provider value for each
// level (`null`: the model does not have it), and whether it takes a
// thinking token budget. The data comes from models.dev. The generator that
// writes it comes with the model catalog later. Until then, edit these
// entries by hand.

const CLOUDFLARE_REASONING = {
  '@cf/google/gemma-4-26b-a4b-it': {
    map: {
      off: 'none',
      minimal: null,
      low: null,
      medium: null,
      high: 'high',
      xhigh: null,
      max: null,
    },
    budget: false,
  },
  '@cf/deepseek-ai/deepseek-v4-flash-0731': {
    map: {
      off: 'none',
      minimal: null,
      low: 'low',
      medium: null,
      high: 'high',
      xhigh: null,
      max: 'max',
    },
    budget: false,
  },
  '@cf/deepseek-ai/deepseek-v4-pro-0813': {
    map: {
      off: 'none',
      minimal: null,
      low: 'low',
      medium: null,
      high: 'high',
      xhigh: null,
      max: 'max',
    },
    budget: false,
  },
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b': { budget: false },
  '@cf/moonshotai/kimi-k2.6': {
    map: {
      off: 'none',
      minimal: null,
      low: null,
      medium: null,
      high: 'high',
      xhigh: null,
      max: null,
    },
    budget: false,
  },
  '@cf/moonshotai/kimi-k2.7-code': { budget: false },
  '@cf/zai-org/glm-5.3-flash': {
    map: {
      off: null,
      minimal: null,
      low: 'low',
      medium: null,
      high: 'high',
      xhigh: null,
      max: 'max',
    },
    budget: false,
  },
  '@cf/zai-org/glm-4.7-flash': {
    map: { off: 'off', minimal: null, low: null, medium: null, high: 'high' },
    budget: false,
  },
  '@cf/zai-org/glm-5.2': {
    map: {
      off: 'none',
      minimal: null,
      low: null,
      medium: null,
      high: 'high',
      xhigh: null,
      max: 'max',
    },
    budget: false,
  },
  '@cf/zai-org/glm-5.3': {
    map: {
      off: null,
      minimal: null,
      low: 'low',
      medium: null,
      high: 'high',
      xhigh: null,
      max: 'max',
    },
    budget: false,
  },
  '@cf/nvidia/nemotron-3-120b-a12b': {
    map: {
      off: 'none',
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: null,
      max: null,
    },
    budget: false,
  },
  '@cf/qwen/qwen3.8-27b': {
    map: {
      off: 'none',
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: null,
      xhigh: 'xhigh',
      max: null,
    },
    budget: false,
  },
  '@cf/qwen/qwq-32b': { budget: false },
  '@cf/qwen/qwen3-30b-a3b-fp8': { budget: false },
  '@cf/openai/gpt-oss-20b': {
    map: {
      off: null,
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: null,
      max: null,
    },
    budget: false,
  },
  '@cf/openai/gpt-oss-120b': {
    map: {
      off: null,
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: null,
      max: null,
    },
    budget: false,
  },
} as const satisfies Record<string, ModelReasoning>

/**
 * Each model's reasoning levels, and whether it takes a token budget, for
 * `chat({ reasoning })`. A model that is not here does not reason.
 */
export type CloudflareModelReasoningByName = {
  [K in keyof typeof CLOUDFLARE_REASONING]: ModelReasoningCapability<
    (typeof CLOUDFLARE_REASONING)[K]
  >
}

/**
 * Runtime map from model id to its reasoning data, for the text adapter. An
 * unknown id gives `undefined`: the adapter sends no reasoning field.
 */
export const CLOUDFLARE_MODEL_REASONING: Readonly<
  Record<string, ModelReasoning>
> = CLOUDFLARE_REASONING
