import type { Modality, ModelReasoning } from '@tanstack/ai'
import type { ModelReasoningCapability } from '@tanstack/ai/adapter-internals'
import type { ZAITextProviderOptions } from './text/text-provider-options'

/** Provider-native tools Z.AI exposes per model. */
export type ZAIProviderToolKind = 'web_search'

/**
 * Internal metadata structure describing a Z.AI chat model's capabilities and
 * pricing.
 */
interface ModelMeta<TProviderOptions = unknown> {
  name: string
  context_window?: number
  max_output_tokens?: number
  knowledge_cutoff?: string
  pricing: {
    input: {
      normal: number
      cached?: number
    }
    output: {
      normal: number
    }
  }
  supports: {
    input: ReadonlyArray<'text' | 'image' | 'video'>
    output: ReadonlyArray<'text'>
    endpoints: ReadonlyArray<'chat'>
    features: ReadonlyArray<
      'streaming' | 'tools' | 'json_object' | 'vision' | 'reasoning'
    >
    tools?: ReadonlyArray<ZAIProviderToolKind>
  }
  providerOptions?: TProviderOptions
  /** The model's data for `chat({ reasoning })`. None: it does not reason. */
  reasoning?: ModelReasoning
}

/**
 * GLM-5.2 reasoning: `reasoning_effort` accepts `high` and `max`. Levels are
 * ordered, so a lower request clamps up to `high`.
 */
const REASONING_HIGH_MAX = {
  levels: { high: 'high', max: 'max' },
  budget: false,
} as const

/**
 * GLM-5.3 reasoning: `reasoning_effort` accepts `low`, `high`, and `max`.
 */
const REASONING_LOW_HIGH_MAX = {
  levels: { low: 'low', high: 'high', max: 'max' },
  budget: false,
} as const

/**
 * GLM-5.3-Flash thinks on every request and only accepts `max` effort, so any
 * lower request clamps up to `max`.
 */
const REASONING_MAX_ONLY = {
  levels: { max: 'max' },
  budget: false,
} as const

// ============================================================================
// GLM-5 Series
// ============================================================================

/**
 * GLM-5.3: Latest flagship model
 * Released August 2026
 * 1M context window, reasoning effort control, strongest coding and agentic
 * capabilities in the GLM-5 line.
 * Pricing: $1.4/M input, $0.26/M cached, $4.4/M output
 */
const GLM_5_3 = {
  name: 'glm-5.3',
  context_window: 1_000_000,
  max_output_tokens: 128_000,
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'reasoning'],
    tools: ['web_search'] as const,
  },
  pricing: {
    input: {
      normal: 1.4,
      cached: 0.26,
    },
    output: {
      normal: 4.4,
    },
  },
  reasoning: REASONING_LOW_HIGH_MAX,
} as const satisfies ModelMeta<ZAITextProviderOptions>

/**
 * GLM-5.3-Flash: Fast multimodal model
 * Released August 2026
 * 1M context window, text, image, and video input, thinking always on.
 * Pricing: $0.15/M input, $0.03/M cached, $0.5/M output
 */
const GLM_5_3_FLASH = {
  name: 'glm-5.3-flash',
  context_window: 1_000_000,
  max_output_tokens: 128_000,
  supports: {
    input: ['text', 'image', 'video'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'vision', 'reasoning'],
    tools: ['web_search'] as const,
  },
  pricing: {
    input: {
      normal: 0.15,
      cached: 0.03,
    },
    output: {
      normal: 0.5,
    },
  },
  reasoning: REASONING_MAX_ONLY,
} as const satisfies ModelMeta<ZAITextProviderOptions>

/**
 * GLM-5.2: Previous flagship model
 * Released June 2026
 * 1M context window, reasoning effort control, strong coding and agentic
 * capabilities.
 * Pricing: $1.4/M input, $0.26/M cached, $4.4/M output
 */
const GLM_5_2 = {
  name: 'glm-5.2',
  context_window: 1_000_000,
  max_output_tokens: 131_072,
  knowledge_cutoff: '2026-06-01',
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'reasoning'],
    tools: ['web_search'] as const,
  },
  pricing: {
    input: {
      normal: 1.4,
      cached: 0.26,
    },
    output: {
      normal: 4.4,
    },
  },
  reasoning: REASONING_HIGH_MAX,
} as const satisfies ModelMeta<ZAITextProviderOptions>

/**
 * GLM-5.1: Long-horizon task flagship model
 * Released April 2026
 * Designed for long-running autonomous tasks (up to 8 hours),
 * with enhanced coding, reasoning, and agentic capabilities.
 * Pricing: $1.4/M input, $0.26/M cached, $4.4/M output
 */
const GLM_5_1 = {
  name: 'glm-5.1',
  context_window: 200_000,
  max_output_tokens: 128_000,
  knowledge_cutoff: '2026-03-01',
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object'],
    tools: ['web_search'] as const,
  },
  pricing: {
    input: {
      normal: 1.4,
      cached: 0.26,
    },
    output: {
      normal: 4.4,
    },
  },
} as const satisfies ModelMeta<ZAITextProviderOptions>

/**
 * GLM-5-Turbo: Fast high-performance text model
 * Released April 2026
 * Optimized for speed with strong coding and reasoning capabilities.
 * Pricing: $1.2/M input, $0.24/M cached, $4.0/M output
 */
const GLM_5_TURBO = {
  name: 'glm-5-turbo',
  context_window: 200_000,
  max_output_tokens: 128_000,
  knowledge_cutoff: '2026-03-01',
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object'],
    tools: ['web_search'] as const,
  },
  pricing: {
    input: {
      normal: 1.2,
      cached: 0.24,
    },
    output: {
      normal: 4.0,
    },
  },
} as const satisfies ModelMeta<ZAITextProviderOptions>

/**
 * GLM-5: Base fifth-generation text model
 * Released April 2026
 * Strong general-purpose capabilities with tool use support.
 * Pricing: $1.0/M input, $0.2/M cached, $3.2/M output
 */
const GLM_5 = {
  name: 'glm-5',
  context_window: 200_000,
  max_output_tokens: 128_000,
  knowledge_cutoff: '2026-03-01',
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object'],
    tools: ['web_search'] as const,
  },
  pricing: {
    input: {
      normal: 1.0,
      cached: 0.2,
    },
    output: {
      normal: 3.2,
    },
  },
} as const satisfies ModelMeta<ZAITextProviderOptions>

/**
 * GLM-5V-Turbo: Multimodal Agent foundation model
 * Released April 2026
 * First multimodal agent model from Zhipu, supports image, video, file, and text input.
 * Optimized for visual programming and complex agent workflows.
 * Pricing: $1.2/M input, $0.24/M cached, $4.0/M output
 */
const GLM_5V_TURBO = {
  name: 'glm-5v-turbo',
  context_window: 200_000,
  max_output_tokens: 128_000,
  knowledge_cutoff: '2026-03-01',
  supports: {
    input: ['text', 'image', 'video'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'vision'],
    tools: ['web_search'] as const,
  },
  pricing: {
    input: {
      normal: 1.2,
      cached: 0.24,
    },
    output: {
      normal: 4.0,
    },
  },
} as const satisfies ModelMeta<ZAITextProviderOptions>

// ============================================================================
// GLM-4 Series
// ============================================================================

/**
 * GLM-4.7: Previous flagship model
 * Released December 2025
 * Features enhanced coding, reasoning, and agentic capabilities
 * Pricing: $0.6/M input, $0.11/M cached, $2.2/M output
 */
const GLM_4_7 = {
  name: 'glm-4.7',
  context_window: 200_000,
  max_output_tokens: 128_000,
  knowledge_cutoff: '2025-12-01',
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object'],
    tools: ['web_search'] as const,
  },
  pricing: {
    input: {
      normal: 0.6,
      cached: 0.11,
    },
    output: {
      normal: 2.2,
    },
  },
} as const satisfies ModelMeta<ZAITextProviderOptions>

/**
 * GLM-4.6V: Multimodal vision model
 * Released December 2024
 * Supports text, image, and video inputs
 */
const GLM_4_6V = {
  name: 'glm-4.6v',
  context_window: 128_000,
  max_output_tokens: 128_000,
  knowledge_cutoff: '2024-12-01',
  supports: {
    input: ['text', 'image', 'video'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'vision'],
    tools: ['web_search'] as const,
  },
  pricing: {
    input: {
      normal: 0.14,
    },
    output: {
      normal: 0.42,
    },
  },
} as const satisfies ModelMeta<ZAITextProviderOptions>

/**
 * GLM-4.6: Previous flagship model
 * Released September 2024
 * Enhanced coding and reasoning capabilities
 * Pricing: $0.6/M input, $0.11/M cached, $2.2/M output
 */
const GLM_4_6 = {
  name: 'glm-4.6',
  context_window: 128_000,
  max_output_tokens: 128_000,
  knowledge_cutoff: '2024-09-01',
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object'],
    tools: ['web_search'] as const,
  },
  pricing: {
    input: {
      normal: 0.6,
      cached: 0.11,
    },
    output: {
      normal: 2.2,
    },
  },
} as const satisfies ModelMeta<ZAITextProviderOptions>

// ============================================================================
// Exports
// ============================================================================

/**
 * All supported Z.AI chat model identifiers.
 */
export const ZAI_CHAT_MODELS = [
  // GLM-5 series
  GLM_5_3.name,
  GLM_5_3_FLASH.name,
  GLM_5_2.name,
  GLM_5_1.name,
  GLM_5_TURBO.name,
  GLM_5.name,
  GLM_5V_TURBO.name,
  // GLM-4 series
  GLM_4_7.name,
  GLM_4_6V.name,
  GLM_4_6.name,
] as const

/**
 * Union type of all supported Z.AI chat model names.
 */
export type ZAIChatModel = (typeof ZAI_CHAT_MODELS)[number]

/**
 * Type-only map from chat model name to its provider options type.
 */
export type ZAIChatModelProviderOptionsByName = {
  [K in ZAIChatModel]: ZAITextProviderOptions
}

/**
 * Type-only map from chat model name to its supported provider tools.
 */
export type ZAIChatModelToolCapabilitiesByName = {
  [GLM_5_3.name]: typeof GLM_5_3.supports.tools
  [GLM_5_3_FLASH.name]: typeof GLM_5_3_FLASH.supports.tools
  [GLM_5_2.name]: typeof GLM_5_2.supports.tools
  [GLM_5_1.name]: typeof GLM_5_1.supports.tools
  [GLM_5_TURBO.name]: typeof GLM_5_TURBO.supports.tools
  [GLM_5.name]: typeof GLM_5.supports.tools
  [GLM_5V_TURBO.name]: typeof GLM_5V_TURBO.supports.tools
  [GLM_4_7.name]: typeof GLM_4_7.supports.tools
  [GLM_4_6V.name]: typeof GLM_4_6V.supports.tools
  [GLM_4_6.name]: typeof GLM_4_6.supports.tools
}

/**
 * Type-only map from chat model name to its supported input modalities.
 */
export type ZAIModelInputModalitiesByName = {
  [GLM_5_3.name]: typeof GLM_5_3.supports.input
  [GLM_5_3_FLASH.name]: typeof GLM_5_3_FLASH.supports.input
  [GLM_5_2.name]: typeof GLM_5_2.supports.input
  [GLM_5_1.name]: typeof GLM_5_1.supports.input
  [GLM_5_TURBO.name]: typeof GLM_5_TURBO.supports.input
  [GLM_5.name]: typeof GLM_5.supports.input
  [GLM_5V_TURBO.name]: typeof GLM_5V_TURBO.supports.input
  [GLM_4_7.name]: typeof GLM_4_7.supports.input
  [GLM_4_6V.name]: typeof GLM_4_6V.supports.input
  [GLM_4_6.name]: typeof GLM_4_6.supports.input
}

/**
 * Runtime map from chat model name to its supported input modalities, for the
 * text adapter's `inputModalities`. `satisfies` keeps it equal to
 * {@link ZAIModelInputModalitiesByName}. An unknown name gives `undefined`.
 */
export const ZAI_MODEL_INPUT_MODALITIES: Readonly<
  Record<string, ReadonlyArray<Modality>>
> = {
  [GLM_5_3.name]: GLM_5_3.supports.input,
  [GLM_5_3_FLASH.name]: GLM_5_3_FLASH.supports.input,
  [GLM_5_2.name]: GLM_5_2.supports.input,
  [GLM_5_1.name]: GLM_5_1.supports.input,
  [GLM_5_TURBO.name]: GLM_5_TURBO.supports.input,
  [GLM_5.name]: GLM_5.supports.input,
  [GLM_5V_TURBO.name]: GLM_5V_TURBO.supports.input,
  [GLM_4_7.name]: GLM_4_7.supports.input,
  [GLM_4_6V.name]: GLM_4_6V.supports.input,
  [GLM_4_6.name]: GLM_4_6.supports.input,
} satisfies ZAIModelInputModalitiesByName

/**
 * Resolves the provider options type for a specific Z.AI model.
 */
export type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof ZAIChatModelProviderOptionsByName
    ? ZAIChatModelProviderOptionsByName[TModel]
    : ZAITextProviderOptions

/**
 * Resolve input modalities for a specific model. An unknown model gets text.
 */
export type ResolveInputModalities<TModel extends string> =
  TModel extends keyof ZAIModelInputModalitiesByName
    ? ZAIModelInputModalitiesByName[TModel]
    : readonly ['text']

const ZAI_REASONING = {
  [GLM_5_3.name]: GLM_5_3.reasoning,
  [GLM_5_3_FLASH.name]: GLM_5_3_FLASH.reasoning,
  [GLM_5_2.name]: GLM_5_2.reasoning,
}

/**
 * Each chat model's reasoning levels, and whether it takes a token budget, for
 * `chat({ reasoning })`. A model that is not here does not reason.
 */
export type ZAIModelReasoningByName = {
  [K in keyof typeof ZAI_REASONING]: ModelReasoningCapability<
    (typeof ZAI_REASONING)[K]
  >
}

/**
 * Runtime map from chat model name to its reasoning data, for the text adapter.
 * An unknown name gives `undefined`: the adapter sends no reasoning field.
 */
export const ZAI_MODEL_REASONING: Readonly<Record<string, ModelReasoning>> =
  ZAI_REASONING

export const ZAI_MODEL_META = {
  [GLM_5_3.name]: GLM_5_3,
  [GLM_5_3_FLASH.name]: GLM_5_3_FLASH,
  [GLM_5_2.name]: GLM_5_2,
  [GLM_5_1.name]: GLM_5_1,
  [GLM_5_TURBO.name]: GLM_5_TURBO,
  [GLM_5.name]: GLM_5,
  [GLM_5V_TURBO.name]: GLM_5V_TURBO,
  [GLM_4_7.name]: GLM_4_7,
  [GLM_4_6V.name]: GLM_4_6V,
  [GLM_4_6.name]: GLM_4_6,
} as const
