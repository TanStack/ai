/**
 * BytePlus ModelArk model metadata.
 *
 * Every Ark model id in this file — chat, video and image — was verified live
 * against `https://ark.ap-southeast.bytepluses.com/api/v3` on 2026-07-31. The
 * two Seed Speech ids are the exception: they live on the voice host, which
 * needs a separate key that was not available, so they are docs-derived.
 * Capability metadata is a mix of probed and docs-derived facts; anything not
 * confirmed against the live API is annotated as such at its declaration.
 * BytePlus
 * deactivates model ids aggressively (the whole `seedance-1-0-lite-*` family,
 * `seed-1-6-lite-*`, `seedream-3-0-*`, and the `doubao-`/`skylark-` names are
 * all 404s internationally), so only dated, probe-confirmed ids are shipped.
 *
 * Prefix rules, also probe-confirmed:
 * - `dola-seed-2-1-turbo-260628` and `dola-seedream-5-0-pro-260628` are the
 *   canonical ids; the bare forms resolve as aliases but the API echoes the
 *   prefixed id back.
 * - The Seedance 2.0 family *requires* the `dreamina-` prefix.
 * - Older models reject the `dola-` prefix outright.
 */
import type { DurationOptions } from '@tanstack/ai/adapters'
import type { BytePlusTextProviderOptions } from './text/text-provider-options'

/**
 * BytePlus exposes no server-side provider tools (no hosted web search, code
 * interpreter, …) on the international Ark endpoint, so every chat model
 * advertises an empty tool set. Typing it as `never` makes passing another
 * provider's `ProviderTool` to a BytePlus adapter a compile-time error.
 */
export type BytePlusProviderToolKind = never

/**
 * Internal metadata structure describing a BytePlus model.
 */
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

// ============================================================================
// Chat models (Seed / GLM / DeepSeek / gpt-oss on Ark)
// ============================================================================

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
    // Adherence-probed 2026-07-31: ACCEPTS a json_schema with 200 but ignores
    // it and answers in prose, so it is not a structured-output model. A
    // status-code-only probe reads this as support — see the note on
    // BYTEPLUS_STRUCTURED_OUTPUT_CHAT_MODELS.
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

/**
 * All supported BytePlus chat model identifiers.
 */
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

/**
 * Union of all supported BytePlus chat model names.
 */
export type BytePlusChatModel = (typeof BYTEPLUS_CHAT_MODELS)[number]

/**
 * Chat models that emit a `encrypted_content` blob alongside
 * `reasoning_content` when thinking is enabled ("thinking summary" models).
 *
 * The blob is an opaque signature over the reasoning trace: when it is
 * present it must be echoed back verbatim on the assistant message in the
 * next turn. Live probing showed omitting it did *not* fail a simple tool
 * round-trip, so adapters preserve and replay it when present but must never
 * treat its absence as an error.
 */
export const BYTEPLUS_THINKING_SUMMARY_MODELS = [
  DOLA_SEED_2_1_TURBO.name,
  SEED_2_0_LITE_260428.name,
  SEED_2_0_MINI_260428.name,
  SEED_2_0_PRO_260328.name,
] as const

/**
 * Union of chat models that emit `encrypted_content`.
 */
export type BytePlusThinkingSummaryModel =
  (typeof BYTEPLUS_THINKING_SUMMARY_MODELS)[number]

const THINKING_SUMMARY_MODEL_SET: ReadonlySet<string> = new Set(
  BYTEPLUS_THINKING_SUMMARY_MODELS,
)

/**
 * True when the model emits `encrypted_content` that should be round-tripped
 * on subsequent turns.
 */
export function emitsEncryptedContent(model: string): boolean {
  return THINKING_SUMMARY_MODEL_SET.has(model)
}

/**
 * Chat models that accept `response_format: {type: 'json_schema'}`.
 *
 * Live-probed against all 18 chat models on 2026-07-31, not docs-derived — the
 * BytePlus capability tables are wrong here in both directions.
 *
 * Membership needs TWO things, because the API has both failure modes:
 * 1. The request is accepted. Seven models (`seed-2-0-lite-260428`,
 *    `seed-2-0-mini-260428`, `seed-2-0-code-preview-260328`, both
 *    `deepseek-v4-*`, `deepseek-v3-2-251201`, `gpt-oss-120b-250805`) answer a
 *    JSON schema with 400 InvalidParameter — and reject
 *    `{type: 'json_object'}` too, so there is no JSON-mode fallback.
 * 2. The schema is actually honoured. `glm-4-7-251222` accepts the request
 *    with 200 and then ignores the schema, answering in prose (reproduced
 *    twice by the adherence probe). A status-code-only probe wrongly reads
 *    that as support, so it is excluded.
 *
 * Models that fail either check need tool-shaped extraction instead.
 *
 * Note that the default chat model `seed-2-0-lite-260428` is one of the
 * rejecting models: structured-output work needs `seed-2-0-lite-260228` or
 * `dola-seed-2-1-turbo-260628`.
 */
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

/**
 * True when the model supports native JSON-schema structured output.
 */
export function supportsStructuredOutput(model: string): boolean {
  return STRUCTURED_OUTPUT_MODEL_SET.has(model)
}

/**
 * Type-only map from chat model name to whether it supports native
 * JSON-schema structured output.
 */
export type BytePlusChatModelStructuredOutputByName = {
  [K in BytePlusChatModel]: K extends BytePlusStructuredOutputChatModel
    ? true
    : false
}

/**
 * Union of chat models supporting native JSON-schema structured output.
 */
export type BytePlusStructuredOutputChatModel =
  (typeof BYTEPLUS_STRUCTURED_OUTPUT_CHAT_MODELS)[number]

/**
 * Type-only map from chat model name to its supported input modalities.
 * Used for type inference when constructing multimodal messages.
 */
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

/**
 * Type-only map from chat model name to its supported provider tools.
 * BytePlus exposes no provider-tool factories, so every model gets an empty
 * tuple — passing another provider's tool is then a compile-time error.
 */
export type BytePlusChatModelToolCapabilitiesByName = {
  [K in BytePlusChatModel]: ReadonlyArray<BytePlusProviderToolKind>
}

/**
 * Type-only map from chat model name to its provider options type.
 */
export type BytePlusChatModelProviderOptionsByName = {
  [K in BytePlusChatModel]: BytePlusTextProviderOptions
}

// ============================================================================
// Video models (Seedance, async task API)
// ============================================================================

/**
 * Output aspect ratios accepted by the Seedance task API. `adaptive` is only
 * meaningful for image-to-video, where the ratio follows the input frame.
 */
export type BytePlusVideoRatio =
  | '16:9'
  | '9:16'
  | '4:3'
  | '3:4'
  | '1:1'
  | '21:9'
  | 'adaptive'

/**
 * Resolution tiers accepted by the Seedance task API.
 *
 * Resolution tiers are model-specific (see
 * {@link BytePlusVideoModelResolutionByName}). Two findings that still
 * contradict older BytePlus prose: there is **no 2K tier on any Seedance
 * model**, and `4k` exists only on `dreamina-seedance-2-0-260128`. Seedance
 * 2.5 accepts 480p/720p/1080p (ModelArk + fal spec, 2026-08-19).
 *
 * The API matches this field case-insensitively (`4K`, `4k` and `1080P` are
 * all accepted), so this package standardizes on the lowercase spelling.
 */
export type BytePlusVideoResolution = '480p' | '720p' | '1080p' | '4k'

/**
 * Generic `size` template for Seedance models: either a bare aspect ratio
 * ("16:9") or `ratio_resolution` ("16:9_720p"). The Seedance API takes the
 * two as separate `ratio` / `resolution` fields; the adapter splits this
 * template back apart.
 */
export type BytePlusVideoSize<
  TResolution extends BytePlusVideoResolution = BytePlusVideoResolution,
> = BytePlusVideoRatio | `${BytePlusVideoRatio}_${TResolution}`

// Multimodal reference-media capabilities (reference images / video / audio)
// are docs-derived from the ModelArk create-task page. Model ids and the
// resolution / duration tables for 2.0 were also live-probed on 2026-07-31;
// 2.5 lands from the public docs once the model was fully opened (2026-08-07).
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

/**
 * All supported Seedance video model identifiers.
 */
export const BYTEPLUS_VIDEO_MODELS = [
  DREAMINA_SEEDANCE_2_5.name,
  DREAMINA_SEEDANCE_2_0.name,
  DREAMINA_SEEDANCE_2_0_FAST.name,
  DREAMINA_SEEDANCE_2_0_MINI.name,
  SEEDANCE_1_5_PRO.name,
  SEEDANCE_1_0_PRO.name,
  SEEDANCE_1_0_PRO_FAST.name,
] as const

/**
 * Union of all supported Seedance video model names.
 */
export type BytePlusVideoModel = (typeof BYTEPLUS_VIDEO_MODELS)[number]

/**
 * Type-only map from video model name to the non-text prompt modalities it
 * accepts. Seedance 2.5 and the 2.0 family take multimodal references
 * (start/end frames, reference images, reference video and audio); the 1.x
 * models take start/end frames only.
 */
export type BytePlusVideoModelInputModalitiesByName = {
  [DREAMINA_SEEDANCE_2_5.name]: readonly ['image', 'video', 'audio']
  [DREAMINA_SEEDANCE_2_0.name]: readonly ['image', 'video', 'audio']
  [DREAMINA_SEEDANCE_2_0_FAST.name]: readonly ['image', 'video', 'audio']
  [DREAMINA_SEEDANCE_2_0_MINI.name]: readonly ['image', 'video', 'audio']
  [SEEDANCE_1_5_PRO.name]: readonly ['image']
  [SEEDANCE_1_0_PRO.name]: readonly ['image']
  [SEEDANCE_1_0_PRO_FAST.name]: readonly ['image']
}

/**
 * Type-only map from video model name to the resolutions it accepts.
 *
 * 2.0 / 1.x cells were probe-verified on 2026-07-31; 2.5 comes from the
 * public ModelArk create-task docs, refreshed 2026-08-19 when native 1080p
 * shipped. Note `seedance-1-0-pro-fast-251015` does accept `1080p`, despite
 * older BytePlus prose listing it as 480p/720p.
 */
export type BytePlusVideoModelResolutionByName = {
  [DREAMINA_SEEDANCE_2_5.name]: '480p' | '720p' | '1080p'
  [DREAMINA_SEEDANCE_2_0.name]: '480p' | '720p' | '1080p' | '4k'
  [DREAMINA_SEEDANCE_2_0_FAST.name]: '480p' | '720p'
  [DREAMINA_SEEDANCE_2_0_MINI.name]: '480p' | '720p'
  [SEEDANCE_1_5_PRO.name]: '480p' | '720p' | '1080p'
  [SEEDANCE_1_0_PRO.name]: '480p' | '720p' | '1080p'
  [SEEDANCE_1_0_PRO_FAST.name]: '480p' | '720p' | '1080p'
}

/**
 * Type-only map from video model name to its accepted `size` strings.
 */
export type BytePlusVideoModelSizeByName = {
  [K in BytePlusVideoModel]: BytePlusVideoSize<
    BytePlusVideoModelResolutionByName[K]
  >
}

/**
 * A Seedance model id: one this package knows, or any other string.
 *
 * The open half is a deliberate escape hatch for models BytePlus ships between
 * releases of this package. Adding a model to {@link BYTEPLUS_VIDEO_MODELS}
 * *narrows* it — the adapter's guards switch on and reject against this
 * file's tables. For a model whose real limits are unknown that is strictly
 * worse than the open path, which lets Ark judge. So an id lands in the
 * known table only once its capability cells are documented or probed.
 *
 * Discovering ids: `GET /models` on the Ark data plane enumerates the catalog
 * (id, `task_type`, `modalities`, `status`). It is not exhaustive —
 * `seedream-5-0-lite-260128` answers requests but is missing from the
 * listing — so absence there is not evidence of absence. The ModelArk
 * release notes (https://docs.byteplus.com/en/docs/ModelArk/1159178) are the
 * other watch surface.
 *
 * To probe an id, POST `/contents/generations/tasks` with only
 * `{"model": "<id>"}`. Three outcomes, all live-verified:
 * - 400 `MissingParameter` (about `content`) — live and usable.
 * - 404 `ModelNotOpen` — real, but not activated on this account.
 * - 404 `InvalidEndpointOrModel.NotFound` — no such model.
 *
 * Unknown ids trade compile-time narrowing for reach: the full size surface is
 * accepted, provider options are ungated, and the adapter's model-specific
 * runtime guards stand down so a new model's legitimate request reaches Ark.
 * Known ids keep their documented / probe-verified narrowing.
 */
export type BytePlusVideoModelOrString = BytePlusVideoModel | (string & {})

/**
 * Resolve the `size` type for a video model: the model's probe-verified
 * template union when known, otherwise the full template surface plus any
 * string (a future model may bring ratios or resolution tiers that do not
 * exist today).
 */
export type ResolveBytePlusVideoSize<TModel extends string> =
  TModel extends BytePlusVideoModel
    ? BytePlusVideoModelSizeByName[TModel]
    : BytePlusVideoSize | (string & {})

/**
 * Resolve the accepted non-text prompt modalities for a video model. Unknown
 * models accept all three rather than none, so a new model's reference media
 * is not a compile error.
 */
export type ResolveBytePlusVideoInputModalities<TModel extends string> =
  TModel extends BytePlusVideoModel
    ? BytePlusVideoModelInputModalitiesByName[TModel]
    : readonly ['image', 'video', 'audio']

const VIDEO_MODEL_SET: ReadonlySet<string> = new Set(BYTEPLUS_VIDEO_MODELS)

/**
 * True when the id is one this package has probe-verified metadata for.
 *
 * The adapter uses this to decide whether its model-specific guards apply:
 * see {@link BytePlusVideoModelOrString}.
 */
export function isKnownBytePlusVideoModel(
  model: string,
): model is BytePlusVideoModel {
  return VIDEO_MODEL_SET.has(model)
}

/**
 * Per-model duration type. Seedance accepts any integer second inside the
 * model's range, so this is a continuous range expressed as `number` — a
 * literal union cannot represent it. (The API also accepts `duration: -1` on
 * Seedance 2.5, 2.0 and 1.5-pro to let the model choose; that is reachable
 * through provider options, not through the generic `duration`.)
 */
export type BytePlusVideoModelDurationByName = {
  [K in BytePlusVideoModel]: number
}

/**
 * Runtime duration table backing `availableDurations()` / `snapDuration()`.
 */
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

/**
 * Duration hint for a model this package has no table for.
 *
 * Spans every range Seedance has shipped so far (2s on the 1.0 models through
 * 30s on Seedance 2.5) so `availableDurations()` can still drive a UI. It is
 * a hint, not a contract: the adapter does **not** snap an unknown model's
 * duration against it, because clamping a future model's legitimate longer
 * request down to 30 would corrupt the request rather than protect it.
 */
export const BYTEPLUS_VIDEO_FALLBACK_DURATIONS: DurationOptions<number> = {
  kind: 'range',
  min: 2,
  max: 30,
  step: 1,
  unit: 'seconds',
}

/**
 * Look up the duration options for a Seedance video model, falling back to
 * {@link BYTEPLUS_VIDEO_FALLBACK_DURATIONS} for an id this package does not
 * know.
 */
export function getBytePlusVideoDurationOptions(
  model: BytePlusVideoModelOrString,
): DurationOptions<number> {
  return isKnownBytePlusVideoModel(model)
    ? BYTEPLUS_VIDEO_DURATIONS[model]
    : BYTEPLUS_VIDEO_FALLBACK_DURATIONS
}

// ============================================================================
// Image models (Seedream)
// ============================================================================

/**
 * Shorthand size tokens accepted by `/images/generations`. A request uses
 * either a token or an explicit `WxH` string — never both.
 */
export type BytePlusImageSizeToken = '1K' | '2K' | '4K'

/**
 * Accepted `size` values for Seedream models: a shorthand token or an
 * explicit pixel size such as `2048x2048`.
 */
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

/**
 * All supported Seedream image model identifiers.
 */
export const BYTEPLUS_IMAGE_MODELS = [
  DOLA_SEEDREAM_5_0_PRO.name,
  SEEDREAM_5_0.name,
  SEEDREAM_5_0_LITE.name,
  SEEDREAM_4_5.name,
  SEEDREAM_4_0.name,
] as const

/**
 * Union of all supported Seedream image model names.
 */
export type BytePlusImageModel = (typeof BYTEPLUS_IMAGE_MODELS)[number]

/**
 * Type-only map from image model name to its accepted `size` strings.
 */
export type BytePlusImageModelSizeByName = {
  [K in BytePlusImageModel]: BytePlusImageSize
}

/**
 * Maximum number of reference images accepted per editing request.
 * Seedream 5.0 Pro caps at 10 references; the other editing-capable models
 * accept up to 14.
 *
 * Docs-derived, not live-probed. The 14 for `seedream-5-0-260128` is weaker
 * still — the docs never state a cap for that model, so it is inferred from
 * the rest of the family.
 */
export const BYTEPLUS_IMAGE_MAX_REFERENCE_IMAGES: {
  readonly [K in BytePlusImageModel]: number
} = {
  'dola-seedream-5-0-pro-260628': 10,
  'seedream-5-0-260128': 14,
  'seedream-5-0-lite-260128': 14,
  'seedream-4-5-251128': 14,
  'seedream-4-0-250828': 14,
}

// ============================================================================
// Seed Speech models (voice host — separate product and API key)
// ============================================================================

const SEED_AUDIO_1_0 = {
  name: 'seed-audio-1.0',
  supports: {
    input: ['text', 'audio'],
    output: ['audio'],
  },
} as const satisfies ModelMeta

// Seed Speech ASR is endpoint-addressed: `POST /api/v3/auc/bigmodel/recognize/
// flash` selects the model through the `X-Api-Resource-Id` header
// (`volc.seedasr.auc_turbo`) and takes no `model` field in the body. This
// synthetic identifier satisfies the SDK's `TranscriptionOptions.model`
// contract and gives logging and fixture matching a stable value.
const SEED_ASR = {
  name: 'seed-asr',
  supports: {
    input: ['audio'],
    output: ['text'],
  },
} as const satisfies ModelMeta

/**
 * All supported Seed Speech TTS model identifiers.
 *
 * Note: TTS runs on `voice.ap-southeast-1.bytepluses.com` with an
 * `X-Api-Key` header and a *different* API key from Ark.
 */
export const BYTEPLUS_TTS_MODELS = [SEED_AUDIO_1_0.name] as const

/**
 * All supported Seed Speech transcription model identifiers.
 */
export const BYTEPLUS_TRANSCRIPTION_MODELS = [SEED_ASR.name] as const

/**
 * Union of all supported Seed Speech TTS model names.
 */
export type BytePlusTTSModel = (typeof BYTEPLUS_TTS_MODELS)[number]

/**
 * Union of all supported Seed Speech transcription model names.
 */
export type BytePlusTranscriptionModel =
  (typeof BYTEPLUS_TRANSCRIPTION_MODELS)[number]

// ============================================================================
// Type resolution helpers
// ============================================================================

/**
 * Resolve provider options for a specific model. Models listed in the chat
 * map get their explicit options; anything else falls back to the base chat
 * options.
 */
export type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof BytePlusChatModelProviderOptionsByName
    ? BytePlusChatModelProviderOptionsByName[TModel]
    : BytePlusTextProviderOptions

/**
 * Resolve input modalities for a specific model. Models missing from the map
 * are treated as text-only.
 */
export type ResolveInputModalities<TModel extends string> =
  TModel extends keyof BytePlusModelInputModalitiesByName
    ? BytePlusModelInputModalitiesByName[TModel]
    : readonly ['text']
