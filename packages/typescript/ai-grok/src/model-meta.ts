import type {
  ExternalTextProviderOptions as ExternalGrokTextProviderOptions,
  ExternalTextProviderOptionsWithoutEffort as ExternalGrokTextProviderOptionsWithoutEffort,
} from './text/text-provider-options'

/**
 * Model metadata interface for documentation and type inference
 */
const GROK_SERVER_SIDE_TOOLS = [
  'web_search',
  'x_search',
  'code_execution',
  'code_interpreter',
  'file_search',
  'collections_search',
  'mcp',
] as const

type GrokServerSideToolKind = (typeof GROK_SERVER_SIDE_TOOLS)[number]

interface ModelMeta {
  name: string
  supports: {
    input: Array<'text' | 'image' | 'audio' | 'video' | 'document'>
    output: Array<'text' | 'image' | 'audio' | 'video'>
    capabilities?: Array<'reasoning' | 'tool_calling' | 'structured_outputs'>
    tools?: ReadonlyArray<GrokServerSideToolKind>
  }
  max_input_tokens?: number
  max_output_tokens?: number
  context_window?: number
  knowledge_cutoff?: string
  pricing?: {
    input: {
      normal: number
      cached?: number
    }
    output: {
      normal: number
    }
  }
}

const GROK_4_2 = {
  name: 'grok-4.2',
  context_window: 2_000_000,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['reasoning', 'structured_outputs', 'tool_calling'],
    tools: GROK_SERVER_SIDE_TOOLS,
  },
  pricing: {
    input: {
      normal: 2,
      cached: 0.2,
    },
    output: {
      normal: 6,
    },
  },
} as const satisfies ModelMeta

const GROK_4_2_NON_REASONING = {
  name: 'grok-4-2-non-reasoning',
  context_window: 2_000_000,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['structured_outputs', 'tool_calling'],
    tools: GROK_SERVER_SIDE_TOOLS,
  },
  pricing: {
    input: {
      normal: 2,
      cached: 0.2,
    },
    output: {
      normal: 6,
    },
  },
} as const satisfies ModelMeta

const GROK_IMAGINE_IMAGE = {
  name: 'grok-imagine-image',
  supports: {
    input: ['text'],
    output: ['image'],
  },
} as const satisfies ModelMeta

/**
 * Grok Chat Models
 * Based on xAI's available models as of 2025
 */
const GROK_4_3 = {
  name: 'grok-4.3',
  context_window: 2_000_000,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['reasoning', 'structured_outputs', 'tool_calling'],
    tools: GROK_SERVER_SIDE_TOOLS,
  },
} as const satisfies ModelMeta

export const GROK_CHAT_MODELS = [
  GROK_4_2.name,
  GROK_4_2_NON_REASONING.name,
  GROK_4_3.name,
] as const

/**
 * Grok Image Generation Models
 */
export const GROK_IMAGE_MODELS = [GROK_IMAGINE_IMAGE.name] as const

// xAI's `/v1/tts` endpoint is endpoint-addressed and does not take a `model`
// parameter. This synthetic identifier satisfies the SDK's `TTSOptions.model`
// contract and provides a stable value for logging and fixture matching.
const GROK_TTS = {
  name: 'grok-tts',
  supports: {
    input: ['text'],
    output: ['audio'],
  },
} as const satisfies ModelMeta

// xAI's `/v1/stt` endpoint is endpoint-addressed and does not take a `model`
// parameter. This synthetic identifier satisfies the SDK's
// `TranscriptionOptions.model` contract.
const GROK_STT = {
  name: 'grok-stt',
  supports: {
    input: ['audio'],
    output: ['text'],
  },
} as const satisfies ModelMeta

const GROK_VOICE_FAST_1 = {
  name: 'grok-voice-fast-1.0',
  supports: {
    input: ['audio', 'text'],
    output: ['audio', 'text'],
    capabilities: ['tool_calling'],
    tools: [] as const,
  },
} as const satisfies ModelMeta

const GROK_VOICE_THINK_FAST_1 = {
  name: 'grok-voice-think-fast-1.0',
  supports: {
    input: ['audio', 'text'],
    output: ['audio', 'text'],
    capabilities: ['reasoning', 'tool_calling'],
    tools: [] as const,
  },
} as const satisfies ModelMeta

export const GROK_TTS_MODELS = [GROK_TTS.name] as const

export const GROK_TRANSCRIPTION_MODELS = [GROK_STT.name] as const

export const GROK_REALTIME_MODELS = [
  GROK_VOICE_FAST_1.name,
  GROK_VOICE_THINK_FAST_1.name,
] as const

export type GrokChatModel = (typeof GROK_CHAT_MODELS)[number]
export type GrokImageModel = (typeof GROK_IMAGE_MODELS)[number]
export type GrokTTSModel = (typeof GROK_TTS_MODELS)[number]
export type GrokTranscriptionModel = (typeof GROK_TRANSCRIPTION_MODELS)[number]
export type GrokRealtimeModel = (typeof GROK_REALTIME_MODELS)[number]

/**
 * Type-only map from Grok chat model name to its supported input modalities.
 * Used for type inference when constructing multimodal messages.
 */
export type GrokModelInputModalitiesByName = {
  [GROK_4_2.name]: typeof GROK_4_2.supports.input
  [GROK_4_2_NON_REASONING.name]: typeof GROK_4_2_NON_REASONING.supports.input
  [GROK_4_3.name]: typeof GROK_4_3.supports.input
}

/**
 * Type-only map from Grok chat model name to its provider options type.
 * Since Grok uses OpenAI-compatible API, we reuse OpenAI provider options.
 */
export type GrokChatModelProviderOptionsByName = {
  [GROK_4_2.name]: ExternalGrokTextProviderOptionsWithoutEffort
  [GROK_4_2_NON_REASONING.name]: ExternalGrokTextProviderOptions
  [GROK_4_3.name]: ExternalGrokTextProviderOptionsWithoutEffort
}

/**
 * Type-only map from Grok chat model name to its supported provider tools.
 * Keyed on each model's `.name` field. Value is the `typeof supports.tools`
 * tuple from each model constant.
 */
export type GrokChatModelToolCapabilitiesByName = {
  [GROK_4_2.name]: typeof GROK_4_2.supports.tools
  [GROK_4_2_NON_REASONING.name]: typeof GROK_4_2_NON_REASONING.supports.tools
  [GROK_4_3.name]: typeof GROK_4_3.supports.tools
}

/**
 * Grok-specific provider options.
 *
 * Targets xAI's Responses API (`/v1/responses`). Common knobs (temperature,
 * topP, maxTokens, metadata) live on the top-level `chat()` / `generate()`
 * call as part of `TextOptions` — pass anything Responses-API-specific
 * (`include`, `store`, `reasoning`, `previous_response_id`, `tool_choice`,
 * `parallel_tool_calls`, `text`, etc.) inside `modelOptions`.
 *
 * The shape lives in `text/text-provider-options.ts`; we re-export it here
 * so model-aware type inference picks it up.
 */
export type GrokProviderOptions = ExternalGrokTextProviderOptions

// ===========================
// Type Resolution Helpers
// ===========================

/**
 * Resolve provider options for a specific model.
 * If the model has explicit options in the map, use those; otherwise use base options.
 */
export type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof GrokChatModelProviderOptionsByName
    ? GrokChatModelProviderOptionsByName[TModel]
    : GrokProviderOptions

/**
 * Resolve input modalities for a specific model.
 * If the model has explicit modalities in the map, use those; otherwise use text only.
 */
export type ResolveInputModalities<TModel extends string> =
  TModel extends keyof GrokModelInputModalitiesByName
    ? GrokModelInputModalitiesByName[TModel]
    : readonly ['text']
