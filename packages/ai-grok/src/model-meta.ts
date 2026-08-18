/**
 * Model metadata interface for documentation and type inference
 */
import type {
  GrokBuildProviderOptions,
  GrokTextProviderOptions,
} from './text/text-provider-options'

interface ModelMeta {
  name: string
  supports: {
    input: Array<'text' | 'image' | 'audio' | 'video' | 'document'>
    output: Array<'text' | 'image' | 'audio' | 'video'>
    capabilities?: Array<'reasoning' | 'tool_calling' | 'structured_outputs'>
    tools?: ReadonlyArray<GrokProviderToolKind>
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

const GROK_4_5 = {
  name: 'grok-4.5',
  context_window: 500_000,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    capabilities: ['reasoning', 'structured_outputs', 'tool_calling'],
    tools: [],
  },
  pricing: {
    input: {
      normal: 2,
      cached: 0.3,
    },
    output: {
      normal: 6,
    },
  },
} as const satisfies ModelMeta

const GROK_4_6 = {
  name: 'grok-4.6',
  context_window: 500_000,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    capabilities: ['reasoning', 'structured_outputs', 'tool_calling'],
    tools: [],
  },
  pricing: {
    input: {
      normal: 2,
      cached: 0.5,
    },
    output: {
      normal: 6,
    },
  },
} as const satisfies ModelMeta

export type GrokProviderToolKind =
  | 'web_search'
  | 'x_search'
  | 'file_search'
  | 'mcp'

const GROK_RESPONSES_TOOLS = [
  'web_search',
  'x_search',
  'file_search',
  'mcp',
] as const satisfies ReadonlyArray<GrokProviderToolKind>

const GROK_2_IMAGE = {
  name: 'grok-2-image-1212',
  supports: {
    input: ['text'],
    output: ['image'],
  },
  pricing: {
    input: {
      normal: 0.07,
    },
    output: {
      normal: 0.07,
    },
  },
} as const satisfies ModelMeta

// Imagine API image models. Pricing is per generated image (output only).
const GROK_IMAGINE_IMAGE = {
  name: 'grok-imagine-image',
  supports: {
    input: ['text', 'image'],
    output: ['image'],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0.02,
    },
  },
} as const satisfies ModelMeta

const GROK_IMAGINE_IMAGE_QUALITY = {
  name: 'grok-imagine-image-quality',
  supports: {
    input: ['text', 'image'],
    output: ['image'],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0.05,
    },
  },
} as const satisfies ModelMeta

// xAI's recommended Imagine image model. Supports the 2.0-only `quality`
// provider option ('low' | 'medium', default 'medium').
const GROK_IMAGINE_IMAGE_2_0 = {
  name: 'grok-imagine-image-2.0',
  supports: {
    input: ['text', 'image'],
    output: ['image'],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0.04,
    },
  },
} as const satisfies ModelMeta

// Imagine API video models. Pricing is per second of generated video
// (output only); generated videos carry an audio track.
//
// Both models support text-to-video and image-to-video (a starting-frame
// image is optional). grok-imagine-video-1.5 is the documented default: it
// adds native 1080p text-to-video plus reference-to-video inputs
// (`reference_images` / `reference_audios`; reference output is capped at
// 720p). Both models also drive video editing (`/v1/videos/edits`) and
// extension (`/v1/videos/extensions`) via a source video prompt part.
const GROK_IMAGINE_VIDEO = {
  name: 'grok-imagine-video',
  supports: {
    input: ['text', 'image', 'video'],
    output: ['video', 'audio'],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      // per second of video
      normal: 0.05,
    },
  },
} as const satisfies ModelMeta

const GROK_IMAGINE_VIDEO_1_5 = {
  name: 'grok-imagine-video-1.5',
  supports: {
    input: ['text', 'image', 'video'],
    output: ['video', 'audio'],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      // per second of video
      normal: 0.08,
    },
  },
} as const satisfies ModelMeta

const GROK_4_3 = {
  name: 'grok-4.3',
  context_window: 1_000_000,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['reasoning', 'structured_outputs', 'tool_calling'],
    tools: GROK_RESPONSES_TOOLS,
  },
  pricing: {
    input: {
      normal: 1.25,
      cached: 0.2,
    },
    output: {
      normal: 2.5,
    },
  },
} as const satisfies ModelMeta

const GROK_BUILD_0_1 = {
  name: 'grok-build-0.1',
  context_window: 256_000,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['reasoning', 'structured_outputs', 'tool_calling'],
    tools: GROK_RESPONSES_TOOLS,
  },
  pricing: {
    input: {
      normal: 1,
      cached: 0.2,
    },
    output: {
      normal: 2,
    },
  },
} as const satisfies ModelMeta

/**
 * Grok chat models supported by the Responses adapter.
 */
export const GROK_CHAT_MODELS = [
  GROK_4_5.name,
  GROK_4_6.name,
  GROK_BUILD_0_1.name,
  GROK_4_3.name,
] as const

/**
 * Grok Image Generation Models
 */
export const GROK_IMAGE_MODELS = [
  GROK_2_IMAGE.name,
  GROK_IMAGINE_IMAGE.name,
  GROK_IMAGINE_IMAGE_2_0.name,
  GROK_IMAGINE_IMAGE_QUALITY.name,
] as const

/**
 * Grok Video Generation Models (xAI Imagine API)
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export const GROK_VIDEO_MODELS = [
  GROK_IMAGINE_VIDEO.name,
  GROK_IMAGINE_VIDEO_1_5.name,
] as const

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

/** @deprecated xAI has deprecated grok-voice-think-fast-1.0 — use grok-voice-think-fast-2.0. */
const GROK_VOICE_THINK_FAST_1 = {
  name: 'grok-voice-think-fast-1.0',
  supports: {
    input: ['audio', 'text'],
    output: ['audio', 'text'],
    capabilities: ['reasoning', 'tool_calling'],
    tools: [] as const,
  },
} as const satisfies ModelMeta

// xAI's current recommended speech-to-speech model.
const GROK_VOICE_THINK_FAST_2 = {
  name: 'grok-voice-think-fast-2.0',
  supports: {
    input: ['audio', 'text'],
    output: ['audio', 'text'],
    capabilities: ['reasoning', 'tool_calling'],
    tools: [] as const,
  },
} as const satisfies ModelMeta

// Rolling alias used by xAI's realtime docs examples; always points at the
// latest speech-to-speech model.
const GROK_VOICE_LATEST = {
  name: 'grok-voice-latest',
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
  GROK_VOICE_THINK_FAST_2.name,
  GROK_VOICE_LATEST.name,
  GROK_VOICE_FAST_1.name,
  GROK_VOICE_THINK_FAST_1.name,
] as const

/**
 * Default speech-to-speech model used by the realtime token issuer and the
 * realtime client adapter when no model is specified. Single source of truth
 * so a future default bump cannot leave the two sides disagreeing.
 */
export const GROK_DEFAULT_REALTIME_MODEL: GrokRealtimeModel =
  'grok-voice-think-fast-2.0'

export type GrokChatModel = (typeof GROK_CHAT_MODELS)[number]
export type GrokImageModel = (typeof GROK_IMAGE_MODELS)[number]
export type GrokVideoModel = (typeof GROK_VIDEO_MODELS)[number]
export type GrokTTSModel = (typeof GROK_TTS_MODELS)[number]
export type GrokTranscriptionModel = (typeof GROK_TRANSCRIPTION_MODELS)[number]
export type GrokRealtimeModel = (typeof GROK_REALTIME_MODELS)[number]

/**
 * Type-only map from Grok chat model name to its supported input modalities.
 * Used for type inference when constructing multimodal messages.
 */
export type GrokModelInputModalitiesByName = {
  [GROK_4_3.name]: typeof GROK_4_3.supports.input
  [GROK_BUILD_0_1.name]: typeof GROK_BUILD_0_1.supports.input
  [GROK_4_5.name]: typeof GROK_4_5.supports.input
  [GROK_4_6.name]: typeof GROK_4_6.supports.input
}

/**
 * Type-only map from Grok chat model name to its supported provider tools.
 * Keeps Grok provider-tool factories type-checked against the models that
 * advertise xAI Responses server-side tools.
 */
export type GrokChatModelToolCapabilitiesByName = {
  [GROK_4_3.name]: typeof GROK_4_3.supports.tools
  [GROK_BUILD_0_1.name]: typeof GROK_BUILD_0_1.supports.tools
}

export type GrokProviderOptions = GrokTextProviderOptions

/**
 * Type-only map from Grok chat model name to its provider options type.
 */
export type GrokChatModelProviderOptionsByName = {
  [GROK_4_3.name]: GrokProviderOptions
  [GROK_BUILD_0_1.name]: GrokBuildProviderOptions
}

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
