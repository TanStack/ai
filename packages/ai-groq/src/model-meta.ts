import type { Modality, ModelReasoning } from '@tanstack/ai'
import type { ModelReasoningCapability } from '@tanstack/ai/adapter-internals'
import type { GroqTextProviderOptions } from './text/text-provider-options'
import type { GroqTTSProviderOptions } from './audio/tts-provider-options'

// Reasoning shapes: the levels a model has for `chat({ reasoning })`, and
// the provider value to send for each. Each model points at one of them.
const EFFORT_LOW_TO_HIGH = {
  levels: { low: 'low', medium: 'medium', high: 'high' },
  budget: false,
} as const
const EFFORT_NONE_LOW_TO_HIGH = {
  levels: { off: 'none', low: 'low', medium: 'medium', high: 'high' },
  budget: false,
} as const

/**
 * Internal metadata structure describing a Groq model's capabilities and pricing.
 */
interface ModelMeta<TProviderOptions = unknown> {
  name: string
  context_window?: number
  max_completion_tokens?: number
  pricing: {
    input?: { normal: number; cached?: number }
    output?: { normal: number }
  }
  supports: {
    input: Array<'text' | 'image' | 'audio'>
    output: Array<'text' | 'audio'>
    endpoints: Array<'chat' | 'tts' | 'transcription' | 'batch'>

    features: Array<
      | 'streaming'
      | 'tools'
      | 'json_object'
      | 'browser_search'
      | 'code_execution'
      | 'reasoning'
      | 'content_moderation'
      | 'json_schema'
      | 'vision'
    >
    tools?: ReadonlyArray<never>
  }
  /**
   * Type-level description of which provider options this model supports.
   */
  providerOptions?: TProviderOptions
  /** The model's data for `chat({ reasoning })`. None: it does not reason. */
  reasoning?: ModelReasoning
}

const LLAMA_PROMPT_GUARD_2_86M = {
  name: 'meta-llama/llama-prompt-guard-2-86m',
  context_window: 512,
  max_completion_tokens: 512,
  pricing: {
    input: {
      normal: 0.04,
    },
    output: {
      normal: 0.04,
    },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'content_moderation', 'json_object'],
    tools: [] as const,
  },
} as const satisfies ModelMeta<GroqTextProviderOptions>

const LLAMA_PROMPT_GUARD_2_22M = {
  name: 'meta-llama/llama-prompt-guard-2-22m',
  context_window: 512,
  max_completion_tokens: 512,
  pricing: {
    input: {
      normal: 0.03,
    },
    output: {
      normal: 0.03,
    },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'content_moderation'],
    tools: [] as const,
  },
} as const satisfies ModelMeta<GroqTextProviderOptions>

const GPT_OSS_120B = {
  name: 'openai/gpt-oss-120b',
  context_window: 131_072,
  max_completion_tokens: 65_536,
  pricing: {
    input: {
      normal: 0.15,
      cached: 0.075,
    },
    output: {
      normal: 0.6,
    },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: [
      'streaming',
      'json_object',
      'json_schema',
      'tools',
      'browser_search',
      'code_execution',
      'reasoning',
    ],
    tools: [] as const,
  },
  reasoning: EFFORT_LOW_TO_HIGH,
} as const satisfies ModelMeta<GroqTextProviderOptions>

const GPT_OSS_SAFEGUARD_20B = {
  name: 'openai/gpt-oss-safeguard-20b',
  context_window: 131_072,
  max_completion_tokens: 65_536,
  pricing: {
    input: {
      normal: 0.075,
      cached: 0.037,
    },
    output: {
      normal: 0.3,
    },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: [
      'streaming',
      'tools',
      'browser_search',
      'code_execution',
      'json_object',
      'json_schema',
      'reasoning',
      'content_moderation',
    ],
    tools: [] as const,
  },
  reasoning: EFFORT_LOW_TO_HIGH,
} as const satisfies ModelMeta<GroqTextProviderOptions>

const GPT_OSS_20B = {
  name: 'openai/gpt-oss-20b',
  context_window: 131_072,
  max_completion_tokens: 65_536,
  pricing: {
    input: {
      normal: 0.075,
      cached: 0.037,
    },
    output: {
      normal: 0.3,
    },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: [
      'streaming',
      'browser_search',
      'code_execution',
      'json_object',
      'json_schema',
      'reasoning',
      'tools',
    ],
    tools: [] as const,
  },
  reasoning: EFFORT_LOW_TO_HIGH,
} as const satisfies ModelMeta<GroqTextProviderOptions>

const QWEN_QWEN3_8_27B = {
  name: 'qwen/qwen3.8-27b',
  context_window: 131_072,
  max_completion_tokens: 16_384,
  pricing: {
    input: {
      normal: 0.8,
    },
    output: {
      normal: 4,
    },
  },
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: [
      'streaming',
      'tools',
      'json_object',
      'json_schema',
      'reasoning',
      'vision',
    ],
    tools: [] as const,
  },
  reasoning: EFFORT_NONE_LOW_TO_HIGH,
} as const satisfies ModelMeta<GroqTextProviderOptions>

const GROQ_CHAT_MODEL_META = [
  LLAMA_PROMPT_GUARD_2_86M,
  LLAMA_PROMPT_GUARD_2_22M,
  GPT_OSS_20B,
  GPT_OSS_120B,
  GPT_OSS_SAFEGUARD_20B,
  QWEN_QWEN3_8_27B,
] as const

/**
 * `true` when structured output must send JSON mode (`json_object`).
 * The model declares `json_object` and does not declare `json_schema`.
 */
export function groqModelPrefersJsonObject(model: string): boolean {
  const found = GROQ_CHAT_MODEL_META.find((item) => item.name === model)
  if (!found) return false
  const features: ReadonlyArray<string> = found.supports.features
  return features.includes('json_object') && !features.includes('json_schema')
}

/**
 * All supported Groq chat model identifiers.
 */
export const GROQ_CHAT_MODELS = [
  LLAMA_PROMPT_GUARD_2_86M.name,
  LLAMA_PROMPT_GUARD_2_22M.name,
  GPT_OSS_20B.name,
  GPT_OSS_120B.name,
  GPT_OSS_SAFEGUARD_20B.name,
  QWEN_QWEN3_8_27B.name,
] as const

/**
 * Union type of all supported Groq chat model names.
 */
export type GroqChatModels = (typeof GROQ_CHAT_MODELS)[number]

/**
 * Type-only map from Groq chat model name to its supported input modalities.
 */
export type GroqModelInputModalitiesByName = {
  [LLAMA_PROMPT_GUARD_2_86M.name]: typeof LLAMA_PROMPT_GUARD_2_86M.supports.input
  [LLAMA_PROMPT_GUARD_2_22M.name]: typeof LLAMA_PROMPT_GUARD_2_22M.supports.input
  [GPT_OSS_20B.name]: typeof GPT_OSS_20B.supports.input
  [GPT_OSS_120B.name]: typeof GPT_OSS_120B.supports.input
  [GPT_OSS_SAFEGUARD_20B.name]: typeof GPT_OSS_SAFEGUARD_20B.supports.input
  [QWEN_QWEN3_8_27B.name]: typeof QWEN_QWEN3_8_27B.supports.input
}

/**
 * Runtime map from chat model name to its supported input modalities, for the
 * text adapter's `inputModalities`. `satisfies` keeps it equal to
 * {@link GroqModelInputModalitiesByName}. An unknown name gives `undefined`.
 */
export const GROQ_MODEL_INPUT_MODALITIES: Readonly<
  Record<string, ReadonlyArray<Modality>>
> = {
  [LLAMA_PROMPT_GUARD_2_86M.name]: LLAMA_PROMPT_GUARD_2_86M.supports.input,
  [LLAMA_PROMPT_GUARD_2_22M.name]: LLAMA_PROMPT_GUARD_2_22M.supports.input,
  [GPT_OSS_20B.name]: GPT_OSS_20B.supports.input,
  [GPT_OSS_120B.name]: GPT_OSS_120B.supports.input,
  [GPT_OSS_SAFEGUARD_20B.name]: GPT_OSS_SAFEGUARD_20B.supports.input,
  [QWEN_QWEN3_8_27B.name]: QWEN_QWEN3_8_27B.supports.input,
} satisfies GroqModelInputModalitiesByName

/**
 * Type-only map from Groq chat model name to its provider options type.
 */
export type GroqChatModelProviderOptionsByName = {
  [K in (typeof GROQ_CHAT_MODELS)[number]]: GroqTextProviderOptions
}

/**
 * Type-only map from Groq chat model name to its supported provider tools.
 * Groq exposes no provider-specific tool factories, so every model gets an
 * empty tuple. This ensures that passing an Anthropic/OpenAI ProviderTool to
 * a Groq adapter produces a compile-time type error.
 */
export type GroqChatModelToolCapabilitiesByName = {
  [LLAMA_PROMPT_GUARD_2_86M.name]: typeof LLAMA_PROMPT_GUARD_2_86M.supports.tools
  [LLAMA_PROMPT_GUARD_2_22M.name]: typeof LLAMA_PROMPT_GUARD_2_22M.supports.tools
  [GPT_OSS_20B.name]: typeof GPT_OSS_20B.supports.tools
  [GPT_OSS_120B.name]: typeof GPT_OSS_120B.supports.tools
  [GPT_OSS_SAFEGUARD_20B.name]: typeof GPT_OSS_SAFEGUARD_20B.supports.tools
  [QWEN_QWEN3_8_27B.name]: typeof QWEN_QWEN3_8_27B.supports.tools
}

/**
 * Type-only map from Groq TTS model name to its provider options type.
 */
export type GroqTTSModelProviderOptionsByName = {
  [K in GroqTTSModel]: GroqTTSProviderOptions
}

/**
 * Resolves the provider options type for a specific Groq model.
 * Checks TTS models first, then chat models, then falls back to generic options.
 */
export type ResolveProviderOptions<TModel extends string> =
  TModel extends GroqTTSModel
    ? GroqTTSProviderOptions
    : TModel extends keyof GroqChatModelProviderOptionsByName
      ? GroqChatModelProviderOptionsByName[TModel]
      : GroqTextProviderOptions

/**
 * Resolve input modalities for a specific model.
 * If the model has explicit modalities in the map, use those; otherwise use text only.
 */
export type ResolveInputModalities<TModel extends string> =
  TModel extends keyof GroqModelInputModalitiesByName
    ? GroqModelInputModalitiesByName[TModel]
    : readonly ['text']

/**
 * All supported Groq transcription model identifiers.
 */
export const GROQ_TRANSCRIPTION_MODELS = [
  'whisper-large-v3-turbo',
  'whisper-large-v3',
] as const

/**
 * Union type of all supported Groq transcription model names.
 */
export type GroqTranscriptionModel = (typeof GROQ_TRANSCRIPTION_MODELS)[number]

// ============================================================================
// TTS Models
// ============================================================================

const ORPHEUS_V1_ENGLISH = {
  name: 'canopylabs/orpheus-v1-english',
  pricing: {
    input: {
      normal: 22,
    },
  },
  supports: {
    input: ['text'],
    output: ['audio'],
    endpoints: ['tts'],
    features: [],
  },
} as const satisfies ModelMeta<GroqTTSProviderOptions>

const ORPHEUS_ARABIC_SAUDI = {
  name: 'canopylabs/orpheus-arabic-saudi',
  pricing: {
    input: {
      normal: 40,
    },
  },
  supports: {
    input: ['text'],
    output: ['audio'],
    endpoints: ['tts'],
    features: [],
  },
} as const satisfies ModelMeta<GroqTTSProviderOptions>

/**
 * All supported Groq TTS model identifiers.
 */
export const GROQ_TTS_MODELS = [
  ORPHEUS_V1_ENGLISH.name,
  ORPHEUS_ARABIC_SAUDI.name,
] as const

/**
 * Union type of all supported Groq TTS model names.
 */
export type GroqTTSModel = (typeof GROQ_TTS_MODELS)[number]

// Reasoning
//
// Each model's `reasoning` field holds its data for `chat({ reasoning })`: the
// levels it has, with the provider value for each, and whether it takes a
// thinking token budget. The data comes from models.dev. The generator that
// writes it comes with the model catalog later. Until then, the sync scripts
// keep these fields as they are.

const GROQ_REASONING = {
  [GPT_OSS_20B.name]: GPT_OSS_20B.reasoning,
  [GPT_OSS_120B.name]: GPT_OSS_120B.reasoning,
  [GPT_OSS_SAFEGUARD_20B.name]: GPT_OSS_SAFEGUARD_20B.reasoning,
  [QWEN_QWEN3_8_27B.name]: QWEN_QWEN3_8_27B.reasoning,
}

/**
 * Each chat model's reasoning levels, and whether it takes a token budget,
 * for `chat({ reasoning })`. Derived from the `reasoning` field. A model
 * that is not here does not reason.
 */
export type GroqModelReasoningByName = {
  [K in keyof typeof GROQ_REASONING]: ModelReasoningCapability<
    (typeof GROQ_REASONING)[K]
  >
}

/**
 * Runtime map from chat model name to its reasoning data, for the text adapter.
 * An unknown name gives `undefined`: the adapter sends no reasoning field.
 */
export const GROQ_MODEL_REASONING: Readonly<Record<string, ModelReasoning>> =
  GROQ_REASONING
