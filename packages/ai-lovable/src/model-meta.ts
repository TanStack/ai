import type { ModelReasoning } from '@tanstack/ai'
import type { ModelReasoningCapability } from '@tanstack/ai/adapter-internals'
import type { LovableEmbeddingProviderOptions } from './embedding/embedding-provider-options'
import type {
  LovableImageProviderOptions,
  LovableImageSize,
} from './image/image-provider-options'
import type { LovableTextProviderOptions } from './text/text-provider-options'
import type {
  LovableHdVideoSize,
  LovableVideoDuration,
  LovableVideoProviderOptions,
  LovableVideoSize,
} from './video/video-provider-options'

// Reasoning shapes: the levels a model has for `chat({ reasoning })`, and
// the provider value to send for each. Each model points at one of them.
const BUDGET_MINIMAL_TO_HIGH = {
  levels: { minimal: 'minimal', low: 'low', medium: 'medium', high: 'high' },
  budget: true,
} as const
const BUDGET_OFF_HIGH = {
  levels: { off: 'off', high: 'high' },
  budget: true,
} as const
const EFFORT_LOW_TO_HIGH = {
  levels: { low: 'low', medium: 'medium', high: 'high' },
  budget: false,
} as const
const EFFORT_MEDIUM_TO_XHIGH = {
  levels: { medium: 'medium', high: 'high', xhigh: 'xhigh' },
  budget: false,
} as const
const EFFORT_MINIMAL_TO_HIGH = {
  levels: { minimal: 'minimal', low: 'low', medium: 'medium', high: 'high' },
  budget: false,
} as const
const EFFORT_NONE_LOW_TO_MAX = {
  levels: {
    off: 'none',
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
    max: 'max',
  },
  budget: false,
} as const
const EFFORT_NONE_LOW_TO_XHIGH = {
  levels: {
    off: 'none',
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
  },
  budget: false,
} as const

/**
 * Chat models listed on https://docs.lovable.dev/features/ai.
 * Ids use the `google/` and `openai/` form that the gateway accepts.
 */
export const LOVABLE_CHAT_MODELS = [
  'google/gemini-3.7-flash',
  'google/gemini-3.6-flash',
  'google/gemini-3.5-flash',
  'google/gemini-3.1-pro-preview',
  'google/gemini-3.1-flash-lite',
  'google/gemini-3-flash-preview',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
  'openai/gpt-5.6-sol',
  'openai/gpt-5.6-terra',
  'openai/gpt-5.6-luna',
  'openai/gpt-5.5-pro',
  'openai/gpt-5.5',
  'openai/gpt-5.4-pro',
  'openai/gpt-5.4',
  'openai/gpt-5.4-mini',
  'openai/gpt-5.4-nano',
  'openai/gpt-5.2',
  'openai/gpt-5',
  'openai/gpt-5-mini',
  'openai/gpt-5-nano',
] as const

export type LovableChatModel = (typeof LOVABLE_CHAT_MODELS)[number]

/**
 * A curated chat model id from `LOVABLE_CHAT_MODELS`.
 */
export type LovableModelId = LovableChatModel

export type LovableChatModelProviderOptionsByName = {
  [K in LovableChatModel]: LovableTextProviderOptions
}

export type LovableModelInputModalitiesByName = {
  [K in LovableChatModel]: readonly ['text', 'image']
}

export type LovableChatModelToolCapabilitiesByName = {
  [K in LovableChatModel]: readonly []
}

export type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof LovableChatModelProviderOptionsByName
    ? LovableChatModelProviderOptionsByName[TModel]
    : LovableTextProviderOptions

export type ResolveInputModalities<TModel extends string> =
  TModel extends keyof LovableModelInputModalitiesByName
    ? LovableModelInputModalitiesByName[TModel]
    : readonly ['text']

export const LOVABLE_IMAGE_MODELS = [
  'openai/gpt-image-2',
  'openai/gpt-image-1-mini',
  'google/gemini-3.1-flash-image',
  'google/gemini-3.1-flash-lite-image',
  'google/gemini-3-pro-image',
  'google/gemini-2.5-flash-image',
] as const

export type LovableImageModel = (typeof LOVABLE_IMAGE_MODELS)[number]

export type LovableImageModelProviderOptionsByName = {
  [K in LovableImageModel]: LovableImageProviderOptions
}

export type LovableImageModelSizeByName = {
  [K in LovableImageModel]: LovableImageSize
}

export type LovableImageModelInputModalitiesByName = {
  [K in LovableImageModel]: readonly ['image']
}

/**
 * @experimental Video generation is an experimental feature and may change.
 */
export const LOVABLE_VIDEO_MODELS = [
  'google/veo-3.1-lite',
  'google/veo-3.1-fast',
  'google/veo-3.1',
] as const

/**
 * @experimental Video generation is an experimental feature and may change.
 */
export type LovableVideoModel = (typeof LOVABLE_VIDEO_MODELS)[number]

export type LovableVideoModelProviderOptionsByName = {
  [K in LovableVideoModel]: LovableVideoProviderOptions
}

export type LovableVideoModelSizeByName = {
  'google/veo-3.1-lite': LovableHdVideoSize
  'google/veo-3.1-fast': LovableVideoSize
  'google/veo-3.1': LovableVideoSize
}

export type LovableVideoModelDurationByName = {
  [K in LovableVideoModel]: LovableVideoDuration
}

export type LovableVideoModelInputModalitiesByName = {
  [K in LovableVideoModel]: readonly ['image']
}

export const LOVABLE_EMBEDDING_MODELS = [
  'google/gemini-embedding-2',
  'google/gemini-embedding-001',
  'openai/text-embedding-3-small',
  'openai/text-embedding-3-large',
] as const

export type LovableEmbeddingModel = (typeof LOVABLE_EMBEDDING_MODELS)[number]

export type LovableEmbeddingModelProviderOptionsByName = {
  [K in LovableEmbeddingModel]: LovableEmbeddingProviderOptions
}

export type LovableEmbeddingModelInputModalitiesByName = {
  [K in LovableEmbeddingModel]: readonly ['text']
}

export const LOVABLE_TTS_MODELS = [
  'openai/gpt-4o-mini-tts',
  'google/gemini-2.5-flash-tts',
  'google/gemini-2.5-pro-tts',
  'google/gemini-2.5-flash-lite-preview-tts',
  'google/gemini-3.1-flash-tts-preview',
] as const

export type LovableTTSModel = (typeof LOVABLE_TTS_MODELS)[number]

export const LOVABLE_TRANSCRIPTION_MODELS = [
  'openai/gpt-4o-mini-transcribe',
  'openai/gpt-4o-transcribe',
] as const

export type LovableTranscriptionModel =
  (typeof LOVABLE_TRANSCRIPTION_MODELS)[number]

// Reasoning
//
// Each model's data for `chat({ reasoning })`: the levels it has, with the
// provider value for each, and whether it takes a thinking token budget. The
// data comes from models.dev. The generator that writes it comes with the model
// catalog later. Until then, edit these entries by hand.

const LOVABLE_REASONING = {
  'google/gemini-3.7-flash': EFFORT_LOW_TO_HIGH,
  'google/gemini-3.6-flash': EFFORT_MINIMAL_TO_HIGH,
  'google/gemini-3.5-flash': EFFORT_MINIMAL_TO_HIGH,
  'google/gemini-3.1-pro-preview': EFFORT_LOW_TO_HIGH,
  'google/gemini-3.1-flash-lite': EFFORT_MINIMAL_TO_HIGH,
  'google/gemini-3-flash-preview': EFFORT_MINIMAL_TO_HIGH,
  'google/gemini-2.5-pro': BUDGET_MINIMAL_TO_HIGH,
  'google/gemini-2.5-flash': BUDGET_OFF_HIGH,
  'google/gemini-2.5-flash-lite': BUDGET_OFF_HIGH,
  'openai/gpt-5.6-sol': EFFORT_NONE_LOW_TO_MAX,
  'openai/gpt-5.6-terra': EFFORT_NONE_LOW_TO_MAX,
  'openai/gpt-5.6-luna': EFFORT_NONE_LOW_TO_MAX,
  'openai/gpt-5.5-pro': EFFORT_MEDIUM_TO_XHIGH,
  'openai/gpt-5.5': EFFORT_NONE_LOW_TO_XHIGH,
  'openai/gpt-5.4-pro': EFFORT_MEDIUM_TO_XHIGH,
  'openai/gpt-5.4': EFFORT_NONE_LOW_TO_XHIGH,
  'openai/gpt-5.4-mini': EFFORT_NONE_LOW_TO_XHIGH,
  'openai/gpt-5.4-nano': EFFORT_NONE_LOW_TO_XHIGH,
  'openai/gpt-5.2': EFFORT_NONE_LOW_TO_XHIGH,
  'openai/gpt-5': EFFORT_MINIMAL_TO_HIGH,
  'openai/gpt-5-mini': EFFORT_MINIMAL_TO_HIGH,
  'openai/gpt-5-nano': EFFORT_MINIMAL_TO_HIGH,
} satisfies Partial<Record<LovableChatModel, ModelReasoning>>

/**
 * Each model's reasoning levels, and whether it takes a token budget, for
 * `chat({ reasoning })`. A model that is not here does not reason.
 */
export type LovableModelReasoningByName = {
  [K in keyof typeof LOVABLE_REASONING]: ModelReasoningCapability<
    (typeof LOVABLE_REASONING)[K]
  >
}

/**
 * Runtime map from model id to its reasoning data, for the text adapter. An
 * unknown id gives `undefined`: the adapter sends no reasoning field.
 */
export const LOVABLE_MODEL_REASONING: Readonly<Record<string, ModelReasoning>> =
  LOVABLE_REASONING
