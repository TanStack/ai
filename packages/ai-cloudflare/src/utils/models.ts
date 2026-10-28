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

// Reasoning shapes: the levels a model has for `chat({ reasoning })`, and
// the provider value to send for each. Each model points at one of them.
const EFFORT_LOW_HIGH_MAX = {
  levels: { low: 'low', high: 'high', max: 'max' },
  budget: false,
} as const
const EFFORT_LOW_TO_HIGH = {
  levels: { low: 'low', medium: 'medium', high: 'high' },
  budget: false,
} as const
const EFFORT_NONE_HIGH = {
  levels: { off: 'none', high: 'high' },
  budget: false,
} as const
const EFFORT_NONE_HIGH_MAX = {
  levels: { off: 'none', high: 'high', max: 'max' },
  budget: false,
} as const
const EFFORT_NONE_LOW_HIGH_MAX = {
  levels: { off: 'none', low: 'low', high: 'high', max: 'max' },
  budget: false,
} as const
const EFFORT_NONE_LOW_MEDIUM_XHIGH = {
  levels: { off: 'none', low: 'low', medium: 'medium', xhigh: 'xhigh' },
  budget: false,
} as const
const EFFORT_NONE_LOW_TO_HIGH = {
  levels: { off: 'none', low: 'low', medium: 'medium', high: 'high' },
  budget: false,
} as const
const EFFORT_OFF_HIGH = {
  levels: { off: 'off', high: 'high' },
  budget: false,
} as const

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
// Each model's data for `chat({ reasoning })`: the levels it has, with the
// provider value for each, and whether it takes a thinking token budget. The
// data comes from models.dev. The generator that writes it comes with the model
// catalog later. Until then, edit these entries by hand.

const CLOUDFLARE_REASONING = {
  '@cf/google/gemma-4-26b-a4b-it': EFFORT_NONE_HIGH,
  '@cf/deepseek-ai/deepseek-v4-flash-0731': EFFORT_NONE_LOW_HIGH_MAX,
  '@cf/deepseek-ai/deepseek-v4-pro-0813': EFFORT_NONE_LOW_HIGH_MAX,
  '@cf/moonshotai/kimi-k2.6': EFFORT_NONE_HIGH,
  '@cf/zai-org/glm-5.3-flash': EFFORT_LOW_HIGH_MAX,
  '@cf/zai-org/glm-4.7-flash': EFFORT_OFF_HIGH,
  '@cf/zai-org/glm-5.2': EFFORT_NONE_HIGH_MAX,
  '@cf/zai-org/glm-5.3': EFFORT_LOW_HIGH_MAX,
  '@cf/nvidia/nemotron-3-120b-a12b': EFFORT_NONE_LOW_TO_HIGH,
  '@cf/qwen/qwen3.8-27b': EFFORT_NONE_LOW_MEDIUM_XHIGH,
  '@cf/openai/gpt-oss-20b': EFFORT_LOW_TO_HIGH,
  '@cf/openai/gpt-oss-120b': EFFORT_LOW_TO_HIGH,
} satisfies Record<string, ModelReasoning>

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
