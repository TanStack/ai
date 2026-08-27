import type { DurationOptions } from '@tanstack/ai/adapters'
import type { BytePlusTextProviderOptions } from './text/text-provider-options'

export type BytePlusProviderToolKind = never

interface ModelMeta {
  name: string
  supports: {
    input: ReadonlyArray<'text' | 'image' | 'audio' | 'video' | 'document'>
    output: ReadonlyArray<'text' | 'image' | 'audio' | 'video'>
    capabilities?: ReadonlyArray<
      'reasoning' | 'tool_calling' | 'structured_outputs'
    >
    tools?: ReadonlyArray<BytePlusProviderToolKind>
  }
  context_window?: number
  max_input_tokens?: number
  max_output_tokens?: number
}

const DOLA_SEED_2_1_TURBO = {
  name: 'dola-seed-2-1-turbo-260628',
  context_window: 256_000,
  max_input_tokens: 256_000,
  max_output_tokens: 256_000,
  supports: {
    input: ['text', 'image', 'video'],
    output: ['text'],
    capabilities: ['reasoning', 'tool_calling', 'structured_outputs'],
    tools: [] as const,
  },
} as const satisfies ModelMeta

const SEED_2_0_LITE_260428 = {
  name: 'seed-2-0-lite-260428',
  context_window: 256_000,
  max_input_tokens: 256_000,
  max_output_tokens: 128_000,
  supports: {
    input: ['text', 'image', 'video', 'audio'],
    output: ['text'],
    // Live-probed 2026-07-31: rejects both json_schema and json_object.
    capabilities: ['reasoning', 'tool_calling'],
    tools: [] as const,
  },
} as const satisfies ModelMeta

const SEED_2_0_MINI_260428 = {
  name: 'seed-2-0-mini-260428',
  context_window: 256_000,
  max_input_tokens: 256_000,
  max_output_tokens: 128_000,
  supports: {
    input: ['text', 'image', 'video', 'audio'],
    output: ['text'],
    // Live-probed 2026-07-31: rejects both json_schema and json_object.
    capabilities: ['reasoning', 'tool_calling'],
    tools: [] as const,
  },
} as const satisfies ModelMeta

const SEED_2_0_PRO_260328 = {
  name: 'seed-2-0-pro-260328',
  context_window: 256_000,
  max_input_tokens: 224_000,
  max_output_tokens: 128_000,
  supports: {
    input: ['text', 'image', 'video'],
    output: ['text'],
    // Live-probed 2026-07-31: accepts json_schema, despite the docs table
    // saying otherwise.
    capabilities: ['reasoning', 'tool_calling', 'structured_outputs'],
    tools: [] as const,
  },
} as const satisfies ModelMeta

const SEED_2_0_LITE_260228 = {
  name: 'seed-2-0-lite-260228',
  context_window: 256_000,
  max_input_tokens: 224_000,
  max_output_tokens: 128_000,
  supports: {
    input: ['text', 'image', 'video'],
    output: ['text'],
    capabilities: ['reasoning', 'tool_calling', 'structured_outputs'],
    tools: [] as const,
  },
} as const satisfies ModelMeta

const SEED_2_0_MINI_260215 = {
  name: 'seed-2-0-mini-260215',
  context_window: 256_000,
  max_input_tokens: 224_000,
  max_output_tokens: 128_000,
  supports: {
    input: ['text', 'image', 'video'],
    output: ['text'],
    capabilities: ['reasoning', 'tool_calling', 'structured_outputs'],
    tools: [] as const,
  },
} as const satisfies ModelMeta

const SEED_2_0_CODE_PREVIEW_260328 = {
  name: 'seed-2-0-code-preview-260328',
  context_window: 256_000,
  max_input_tokens: 224_000,
  max_output_tokens: 128_000,
  supports: {
    input: ['text', 'image', 'video'],
    output: ['text'],
    capabilities: ['reasoning', 'tool_calling'],
    tools: [] as const,
  },
} as const satisfies ModelMeta

const SEED_1_8_251228 = {
  name: 'seed-1-8-251228',
  context_window: 256_000,
  max_input_tokens: 224_000,
  max_output_tokens: 64_000,
  supports: {
    input: ['text', 'image', 'video'],
    output: ['text'],
    capabilities: ['reasoning', 'tool_calling', 'structured_outputs'],
    tools: [] as const,
  },
} as const satisfies ModelMeta

const SEED_1_6_250915 = {
  name: 'seed-1-6-250915',
  context_window: 256_000,
  max_input_tokens: 224_000,
  max_output_tokens: 32_000,
  supports: {
    input: ['text', 'image', 'video'],
    output: ['text'],
    capabilities: ['reasoning', 'tool_calling', 'structured_outputs'],
    tools: [] as const,
  },
} as const satisfies ModelMeta

const SEED_1_6_250615 = {
  name: 'seed-1-6-250615',
  context_window: 256_000,
  max_input_tokens: 224_000,
  max_output_tokens: 32_000,
  supports: {
    input: ['text', 'image', 'video'],
    output: ['text'],
    capabilities: ['reasoning', 'tool_calling', 'structured_outputs'],
    tools: [] as const,
  },
} as const satisfies ModelMeta

const SEED_1_6_FLASH_250715 = {
  name: 'seed-1-6-flash-250715',
  context_window: 256_000,
  max_input_tokens: 224_000,
  max_output_tokens: 32_000,
  supports: {
    input: ['text', 'image', 'video'],
    output: ['text'],
    capabilities: ['reasoning', 'tool_calling', 'structured_outputs'],
    tools: [] as const,
  },
} as const satisfies ModelMeta

const SEED_1_6_FLASH_250615 = {
  name: 'seed-1-6-flash-250615',
  context_window: 256_000,
  max_input_tokens: 224_000,
  max_output_tokens: 32_000,
  supports: {
    input: ['text', 'image', 'video'],
    output: ['text'],
    capabilities: ['reasoning', 'tool_calling', 'structured_outputs'],
    tools: [] as const,
  },
} as const satisfies ModelMeta

const GLM_5_2_260617 = {
  name: 'glm-5-2-260617',
  context_window: 1_024_000,
  max_input_tokens: 1_024_000,
  max_output_tokens: 128_000,
  supports: {
    input: ['text'],
    output: ['text'],
    // Live-probed 2026-07-31: accepts json_schema, despite the docs table
    // saying otherwise.
    capabilities: ['reasoning', 'tool_calling', 'structured_outputs'],
    tools: [] as const,
  },
} as const satisfies ModelMeta

const GLM_4_7_251222 = {
  name: 'glm-4-7-251222',
  context_window: 256_000,
  max_input_tokens: 224_000,
  max_output_tokens: 128_000,
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['reasoning', 'tool_calling'],
    tools: [] as const,
  },
} as const satisfies ModelMeta

const DEEPSEEK_V4_PRO_260425 = {
  name: 'deepseek-v4-pro-260425',
  context_window: 1_024_000,
  max_input_tokens: 1_024_000,
  max_output_tokens: 384_000,
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['reasoning', 'tool_calling'],
    tools: [] as const,
  },
} as const satisfies ModelMeta

const DEEPSEEK_V4_FLASH_260425 = {
  name: 'deepseek-v4-flash-260425',
  context_window: 1_024_000,
  max_input_tokens: 1_024_000,
  max_output_tokens: 384_000,
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['reasoning', 'tool_calling'],
    tools: [] as const,
  },
} as const satisfies ModelMeta

// The one model on Ark that defaults to `thinking: disabled`.
const DEEPSEEK_V3_2_251201 = {
  name: 'deepseek-v3-2-251201',
  context_window: 128_000,
  max_input_tokens: 128_000,
  max_output_tokens: 32_000,
  supports: {
    input: ['text'],
    output: ['text'],
    // Live-probed 2026-07-31: rejects both json_schema and json_object.
    capabilities: ['reasoning', 'tool_calling'],
    tools: [] as const,
  },
} as const satisfies ModelMeta

// The only model accepting `thinking: {type: 'auto'}`. Tool calling is
// undocumented on Ark and unverified, so it is not advertised.
const GPT_OSS_120B_250805 = {
  name: 'gpt-oss-120b-250805',
  context_window: 128_000,
  max_input_tokens: 96_000,
  max_output_tokens: 64_000,
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['reasoning'],
    tools: [] as const,
  },
} as const satisfies ModelMeta

export const BYTEPLUS_CHAT_MODELS = [
  DOLA_SEED_2_1_TURBO.name,
  SEED_2_0_LITE_260428.name,
  SEED_2_0_MINI_260428.name,
  SEED_2_0_PRO_260328.name,
  SEED_2_0_LITE_260228.name,
  SEED_2_0_MINI_260215.name,
  SEED_2_0_CODE_PREVIEW_260328.name,
  SEED_1_8_251228.name,
  SEED_1_6_250915.name,
  SEED_1_6_250615.name,
  SEED_1_6_FLASH_250715.name,
  SEED_1_6_FLASH_250615.name,
  GLM_5_2_260617.name,
  GLM_4_7_251222.name,
  DEEPSEEK_V4_PRO_260425.name,
  DEEPSEEK_V4_FLASH_260425.name,
  DEEPSEEK_V3_2_251201.name,
  GPT_OSS_120B_250805.name,
] as const

export type BytePlusChatModel = (typeof BYTEPLUS_CHAT_MODELS)[number]

export const BYTEPLUS_THINKING_SUMMARY_MODELS = [
  DOLA_SEED_2_1_TURBO.name,
  SEED_2_0_LITE_260428.name,
  SEED_2_0_MINI_260428.name,
  SEED_2_0_PRO_260328.name,
] as const

export type BytePlusThinkingSummaryModel =
  (typeof BYTEPLUS_THINKING_SUMMARY_MODELS)[number]

const THINKING_SUMMARY_MODEL_SET: ReadonlySet<string> = new Set(
  BYTEPLUS_THINKING_SUMMARY_MODELS,
)

export function emitsEncryptedContent(model: string): boolean {
  return THINKING_SUMMARY_MODEL_SET.has(model)
}

export const BYTEPLUS_STRUCTURED_OUTPUT_CHAT_MODELS = [
  DOLA_SEED_2_1_TURBO.name,
  SEED_2_0_PRO_260328.name,
  SEED_2_0_LITE_260228.name,
  SEED_2_0_MINI_260215.name,
  SEED_1_8_251228.name,
  SEED_1_6_250915.name,
  SEED_1_6_250615.name,
  SEED_1_6_FLASH_250715.name,
  SEED_1_6_FLASH_250615.name,
  GLM_5_2_260617.name,
] as const

const STRUCTURED_OUTPUT_MODEL_SET: ReadonlySet<string> = new Set(
  BYTEPLUS_STRUCTURED_OUTPUT_CHAT_MODELS,
)

export function supportsStructuredOutput(model: string): boolean {
  return STRUCTURED_OUTPUT_MODEL_SET.has(model)
}

export type BytePlusChatModelStructuredOutputByName = {
  [K in BytePlusChatModel]: K extends BytePlusStructuredOutputChatModel
    ? true
    : false
}

export type BytePlusStructuredOutputChatModel =
  (typeof BYTEPLUS_STRUCTURED_OUTPUT_CHAT_MODELS)[number]

export type BytePlusModelInputModalitiesByName = {
  [DOLA_SEED_2_1_TURBO.name]: typeof DOLA_SEED_2_1_TURBO.supports.input
  [SEED_2_0_LITE_260428.name]: typeof SEED_2_0_LITE_260428.supports.input
  [SEED_2_0_MINI_260428.name]: typeof SEED_2_0_MINI_260428.supports.input
  [SEED_2_0_PRO_260328.name]: typeof SEED_2_0_PRO_260328.supports.input
  [SEED_2_0_LITE_260228.name]: typeof SEED_2_0_LITE_260228.supports.input
  [SEED_2_0_MINI_260215.name]: typeof SEED_2_0_MINI_260215.supports.input
  [SEED_2_0_CODE_PREVIEW_260328.name]: typeof SEED_2_0_CODE_PREVIEW_260328.supports.input
  [SEED_1_8_251228.name]: typeof SEED_1_8_251228.supports.input
  [SEED_1_6_250915.name]: typeof SEED_1_6_250915.supports.input
  [SEED_1_6_250615.name]: typeof SEED_1_6_250615.supports.input
  [SEED_1_6_FLASH_250715.name]: typeof SEED_1_6_FLASH_250715.supports.input
  [SEED_1_6_FLASH_250615.name]: typeof SEED_1_6_FLASH_250615.supports.input
  [GLM_5_2_260617.name]: typeof GLM_5_2_260617.supports.input
  [GLM_4_7_251222.name]: typeof GLM_4_7_251222.supports.input
  [DEEPSEEK_V4_PRO_260425.name]: typeof DEEPSEEK_V4_PRO_260425.supports.input
  [DEEPSEEK_V4_FLASH_260425.name]: typeof DEEPSEEK_V4_FLASH_260425.supports.input
  [DEEPSEEK_V3_2_251201.name]: typeof DEEPSEEK_V3_2_251201.supports.input
  [GPT_OSS_120B_250805.name]: typeof GPT_OSS_120B_250805.supports.input
}

export type BytePlusChatModelToolCapabilitiesByName = {
  [K in BytePlusChatModel]: ReadonlyArray<BytePlusProviderToolKind>
}

export type BytePlusChatModelProviderOptionsByName = {
  [K in BytePlusChatModel]: BytePlusTextProviderOptions
}

export type BytePlusVideoRatio =
  | '16:9'
  | '9:16'
  | '4:3'
  | '3:4'
  | '1:1'
  | '21:9'
  | 'adaptive'

export type BytePlusVideoResolution = '480p' | '720p' | '1080p' | '4k'

export type BytePlusVideoSize<
  TResolution extends BytePlusVideoResolution = BytePlusVideoResolution,
> = BytePlusVideoRatio | `${BytePlusVideoRatio}_${TResolution}`

const DREAMINA_SEEDANCE_2_5 = {
  name: 'dreamina-seedance-2-5-260628',
  supports: {
    input: ['text', 'image', 'video', 'audio'],
    output: ['video', 'audio'],
  },
} as const satisfies ModelMeta

const DREAMINA_SEEDANCE_2_0 = {
  name: 'dreamina-seedance-2-0-260128',
  supports: {
    input: ['text', 'image', 'video', 'audio'],
    output: ['video', 'audio'],
  },
} as const satisfies ModelMeta

const DREAMINA_SEEDANCE_2_0_FAST = {
  name: 'dreamina-seedance-2-0-fast-260128',
  supports: {
    input: ['text', 'image', 'video', 'audio'],
    output: ['video', 'audio'],
  },
} as const satisfies ModelMeta

const DREAMINA_SEEDANCE_2_0_MINI = {
  name: 'dreamina-seedance-2-0-mini-260615',
  supports: {
    input: ['text', 'image', 'video', 'audio'],
    output: ['video', 'audio'],
  },
} as const satisfies ModelMeta

const SEEDANCE_1_5_PRO = {
  name: 'seedance-1-5-pro-251215',
  supports: {
    input: ['text', 'image'],
    output: ['video', 'audio'],
  },
} as const satisfies ModelMeta

const SEEDANCE_1_0_PRO = {
  name: 'seedance-1-0-pro-250528',
  supports: {
    input: ['text', 'image'],
    output: ['video'],
  },
} as const satisfies ModelMeta

const SEEDANCE_1_0_PRO_FAST = {
  name: 'seedance-1-0-pro-fast-251015',
  supports: {
    input: ['text', 'image'],
    output: ['video'],
  },
} as const satisfies ModelMeta

export const BYTEPLUS_VIDEO_MODELS = [
  DREAMINA_SEEDANCE_2_5.name,
  DREAMINA_SEEDANCE_2_0.name,
  DREAMINA_SEEDANCE_2_0_FAST.name,
  DREAMINA_SEEDANCE_2_0_MINI.name,
  SEEDANCE_1_5_PRO.name,
  SEEDANCE_1_0_PRO.name,
  SEEDANCE_1_0_PRO_FAST.name,
] as const

export type BytePlusVideoModel = (typeof BYTEPLUS_VIDEO_MODELS)[number]

export type BytePlusVideoModelInputModalitiesByName = {
  [DREAMINA_SEEDANCE_2_5.name]: readonly ['image', 'video', 'audio']
  [DREAMINA_SEEDANCE_2_0.name]: readonly ['image', 'video', 'audio']
  [DREAMINA_SEEDANCE_2_0_FAST.name]: readonly ['image', 'video', 'audio']
  [DREAMINA_SEEDANCE_2_0_MINI.name]: readonly ['image', 'video', 'audio']
  [SEEDANCE_1_5_PRO.name]: readonly ['image']
  [SEEDANCE_1_0_PRO.name]: readonly ['image']
  [SEEDANCE_1_0_PRO_FAST.name]: readonly ['image']
}

export type BytePlusVideoModelResolutionByName = {
  [DREAMINA_SEEDANCE_2_5.name]: '480p' | '720p' | '1080p'
  [DREAMINA_SEEDANCE_2_0.name]: '480p' | '720p' | '1080p' | '4k'
  [DREAMINA_SEEDANCE_2_0_FAST.name]: '480p' | '720p'
  [DREAMINA_SEEDANCE_2_0_MINI.name]: '480p' | '720p'
  [SEEDANCE_1_5_PRO.name]: '480p' | '720p' | '1080p'
  [SEEDANCE_1_0_PRO.name]: '480p' | '720p' | '1080p'
  [SEEDANCE_1_0_PRO_FAST.name]: '480p' | '720p' | '1080p'
}

export type BytePlusVideoModelSizeByName = {
  [K in BytePlusVideoModel]: BytePlusVideoSize<
    BytePlusVideoModelResolutionByName[K]
  >
}

export type BytePlusVideoModelOrString = BytePlusVideoModel | (string & {})

export type ResolveBytePlusVideoSize<TModel extends string> =
  TModel extends BytePlusVideoModel
    ? BytePlusVideoModelSizeByName[TModel]
    : BytePlusVideoSize | (string & {})

export type ResolveBytePlusVideoInputModalities<TModel extends string> =
  TModel extends BytePlusVideoModel
    ? BytePlusVideoModelInputModalitiesByName[TModel]
    : readonly ['image', 'video', 'audio']

const VIDEO_MODEL_SET: ReadonlySet<string> = new Set(BYTEPLUS_VIDEO_MODELS)

export function isKnownBytePlusVideoModel(
  model: string,
): model is BytePlusVideoModel {
  return VIDEO_MODEL_SET.has(model)
}

export type BytePlusVideoModelDurationByName = {
  [K in BytePlusVideoModel]: number
}

export const BYTEPLUS_VIDEO_DURATIONS: {
  readonly [TModel in BytePlusVideoModel]: DurationOptions<
    BytePlusVideoModelDurationByName[TModel]
  >
} = {
  'dreamina-seedance-2-5-260628': {
    kind: 'range',
    min: 4,
    max: 30,
    step: 1,
    unit: 'seconds',
  },
  'dreamina-seedance-2-0-260128': {
    kind: 'range',
    min: 4,
    max: 15,
    step: 1,
    unit: 'seconds',
  },
  'dreamina-seedance-2-0-fast-260128': {
    kind: 'range',
    min: 4,
    max: 15,
    step: 1,
    unit: 'seconds',
  },
  'dreamina-seedance-2-0-mini-260615': {
    kind: 'range',
    min: 4,
    max: 15,
    step: 1,
    unit: 'seconds',
  },
  'seedance-1-5-pro-251215': {
    kind: 'range',
    min: 4,
    max: 12,
    step: 1,
    unit: 'seconds',
  },
  'seedance-1-0-pro-250528': {
    kind: 'range',
    min: 2,
    max: 12,
    step: 1,
    unit: 'seconds',
  },
  'seedance-1-0-pro-fast-251015': {
    kind: 'range',
    min: 2,
    max: 12,
    step: 1,
    unit: 'seconds',
  },
}

export const BYTEPLUS_VIDEO_FALLBACK_DURATIONS: DurationOptions<number> = {
  kind: 'range',
  min: 2,
  max: 30,
  step: 1,
  unit: 'seconds',
}

export function getBytePlusVideoDurationOptions(
  model: BytePlusVideoModelOrString,
): DurationOptions<number> {
  return isKnownBytePlusVideoModel(model)
    ? BYTEPLUS_VIDEO_DURATIONS[model]
    : BYTEPLUS_VIDEO_FALLBACK_DURATIONS
}

export type BytePlusImageSizeToken = '1K' | '2K' | '4K'

export type BytePlusImageSize = BytePlusImageSizeToken | `${number}x${number}`

const DOLA_SEEDREAM_5_0_PRO = {
  name: 'dola-seedream-5-0-pro-260628',
  supports: {
    input: ['text', 'image'],
    output: ['image'],
  },
} as const satisfies ModelMeta

const SEEDREAM_5_0 = {
  name: 'seedream-5-0-260128',
  supports: {
    input: ['text', 'image'],
    output: ['image'],
  },
} as const satisfies ModelMeta

const SEEDREAM_5_0_LITE = {
  name: 'seedream-5-0-lite-260128',
  supports: {
    input: ['text', 'image'],
    output: ['image'],
  },
} as const satisfies ModelMeta

const SEEDREAM_4_5 = {
  name: 'seedream-4-5-251128',
  supports: {
    input: ['text', 'image'],
    output: ['image'],
  },
} as const satisfies ModelMeta

const SEEDREAM_4_0 = {
  name: 'seedream-4-0-250828',
  supports: {
    input: ['text', 'image'],
    output: ['image'],
  },
} as const satisfies ModelMeta

export const BYTEPLUS_IMAGE_MODELS = [
  DOLA_SEEDREAM_5_0_PRO.name,
  SEEDREAM_5_0.name,
  SEEDREAM_5_0_LITE.name,
  SEEDREAM_4_5.name,
  SEEDREAM_4_0.name,
] as const

export type BytePlusImageModel = (typeof BYTEPLUS_IMAGE_MODELS)[number]

export type BytePlusImageModelSizeByName = {
  [K in BytePlusImageModel]: BytePlusImageSize
}

export const BYTEPLUS_IMAGE_MAX_REFERENCE_IMAGES: {
  readonly [K in BytePlusImageModel]: number
} = {
  'dola-seedream-5-0-pro-260628': 10,
  'seedream-5-0-260128': 14,
  'seedream-5-0-lite-260128': 14,
  'seedream-4-5-251128': 14,
  'seedream-4-0-250828': 14,
}

const SEED_AUDIO_1_0 = {
  name: 'seed-audio-1.0',
  supports: {
    input: ['text', 'audio'],
    output: ['audio'],
  },
} as const satisfies ModelMeta

const SEED_ASR = {
  name: 'seed-asr',
  supports: {
    input: ['audio'],
    output: ['text'],
  },
} as const satisfies ModelMeta

export const BYTEPLUS_TTS_MODELS = [SEED_AUDIO_1_0.name] as const

export const BYTEPLUS_TRANSCRIPTION_MODELS = [SEED_ASR.name] as const

export type BytePlusTTSModel = (typeof BYTEPLUS_TTS_MODELS)[number]

export type BytePlusTranscriptionModel =
  (typeof BYTEPLUS_TRANSCRIPTION_MODELS)[number]

export type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof BytePlusChatModelProviderOptionsByName
    ? BytePlusChatModelProviderOptionsByName[TModel]
    : BytePlusTextProviderOptions

export type ResolveInputModalities<TModel extends string> =
  TModel extends keyof BytePlusModelInputModalitiesByName
    ? BytePlusModelInputModalitiesByName[TModel]
    : readonly ['text']
