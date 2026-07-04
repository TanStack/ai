import type {
  AnthropicAdaptiveOnlyThinkingOptions,
  AnthropicAdaptiveOrDisabledThinkingOptions,
  AnthropicAdaptiveThinkingOptions,
  AnthropicContainerOptions,
  AnthropicContextManagementOptions,
  AnthropicMCPOptions,
  AnthropicMaxTokensOptions,
  AnthropicOutputConfigOptions,
  AnthropicSamplingOptions,
  AnthropicServiceTierOptions,
  AnthropicStopSequencesOptions,
  AnthropicThinkingOptions,
  AnthropicToolChoiceOptions,
} from './text/text-provider-options'

interface ModelMeta<
  TProviderOptions = unknown,
  TToolCapabilities = unknown,
  TMessageCapabilities = unknown,
> {
  name: string
  id: string
  supports: {
    input: Array<'text' | 'image' | 'audio' | 'video' | 'document'>
    extended_thinking?: boolean
    adaptive_thinking?: boolean
    priority_tier?: boolean
    tools?: Array<
      | 'web_search'
      | 'web_fetch'
      | 'code_execution'
      | 'computer_use'
      | 'bash'
      | 'text_editor'
      | 'memory'
    >
  }
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
  /**
   * Type-level description of which provider options this model supports.
   */
  providerOptions?: TProviderOptions
  /**
   * Type-level description of which tool capabilities this model supports.
   */
  toolCapabilities?: TToolCapabilities
  /**
   * Type-level description of which message/input capabilities this model supports.
   */
  messageCapabilities?: TMessageCapabilities
}

// Claude Opus 4.6 accepts adaptive thinking alongside the deprecated
// budget-based extended thinking, and still accepts sampling parameters.
const CLAUDE_OPUS_4_6 = {
  name: 'claude-opus-4-6',
  id: 'claude-opus-4-6',
  context_window: 200_000,
  max_output_tokens: 128_000,
  knowledge_cutoff: '2025-05-01',
  pricing: {
    input: {
      normal: 5,
    },
    output: {
      normal: 25,
    },
  },
  supports: {
    input: ['text', 'image', 'document'],
    extended_thinking: true,
    adaptive_thinking: true,
    priority_tier: true,
    tools: [
      'web_search',
      'web_fetch',
      'code_execution',
      'computer_use',
      'bash',
      'text_editor',
      'memory',
    ],
  },
} as const satisfies ModelMeta<
  AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicAdaptiveThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions
>

const CLAUDE_OPUS_4_5 = {
  name: 'claude-opus-4-5',
  id: 'claude-opus-4-5',
  context_window: 200_000,
  max_output_tokens: 32_000,
  knowledge_cutoff: '2025-11-01',
  pricing: {
    input: {
      normal: 15,
    },
    output: {
      normal: 75,
    },
  },
  supports: {
    input: ['text', 'image', 'document'],
    extended_thinking: true,
    priority_tier: true,
    tools: [
      'web_search',
      'web_fetch',
      'code_execution',
      'computer_use',
      'bash',
      'text_editor',
      'memory',
    ],
  },
} as const satisfies ModelMeta<
  AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions
>

// Claude Sonnet 4.6 accepts adaptive thinking alongside the deprecated
// budget-based extended thinking, and still accepts sampling parameters.
const CLAUDE_SONNET_4_6 = {
  name: 'claude-sonnet-4-6',
  id: 'claude-sonnet-4-6',
  context_window: 1_000_000,
  max_output_tokens: 64_000,
  knowledge_cutoff: '2025-08-01',
  pricing: {
    input: {
      normal: 3,
    },
    output: {
      normal: 15,
    },
  },
  supports: {
    input: ['text', 'image', 'document'],
    extended_thinking: true,
    adaptive_thinking: true,
    priority_tier: true,
    tools: [
      'web_search',
      'web_fetch',
      'code_execution',
      'computer_use',
      'bash',
      'text_editor',
      'memory',
    ],
  },
} as const satisfies ModelMeta<
  AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicAdaptiveThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions
>

const CLAUDE_SONNET_4_5 = {
  name: 'claude-sonnet-4-5',
  id: 'claude-sonnet-4-5',
  context_window: 200_000,
  max_output_tokens: 64_000,
  knowledge_cutoff: '2025-09-29',
  pricing: {
    input: {
      normal: 3,
    },
    output: {
      normal: 15,
    },
  },
  supports: {
    input: ['text', 'image', 'document'],
    extended_thinking: true,
    priority_tier: true,
    tools: [
      'web_search',
      'web_fetch',
      'code_execution',
      'computer_use',
      'bash',
      'text_editor',
      'memory',
    ],
  },
} as const satisfies ModelMeta<
  AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions
>

const CLAUDE_HAIKU_4_5 = {
  name: 'claude-haiku-4-5',
  id: 'claude-haiku-4-5',
  context_window: 200_000,
  max_output_tokens: 64_000,
  knowledge_cutoff: '2025-10-01',
  pricing: {
    input: {
      normal: 1,
    },
    output: {
      normal: 5,
    },
  },
  supports: {
    input: ['text', 'image', 'document'],
    extended_thinking: true,
    priority_tier: true,
    tools: [
      'web_search',
      'web_fetch',
      'code_execution',
      'computer_use',
      'bash',
      'text_editor',
      'memory',
    ],
  },
} as const satisfies ModelMeta<
  AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions
>

const CLAUDE_OPUS_4_1 = {
  name: 'claude-opus-4-1',
  id: 'claude-opus-4-1',
  context_window: 200_000,
  max_output_tokens: 64_000,
  knowledge_cutoff: '2025-08-05',
  pricing: {
    input: {
      normal: 15,
    },
    output: {
      normal: 75,
    },
  },
  supports: {
    input: ['text', 'image', 'document'],
    extended_thinking: true,
    priority_tier: true,
    tools: [
      'web_search',
      'web_fetch',
      'code_execution',
      'computer_use',
      'bash',
      'text_editor',
      'memory',
    ],
  },
} as const satisfies ModelMeta<
  AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions
>

// Claude Opus 4.7 removed budget-based extended thinking and the sampling
// parameters (`temperature`, `top_p`, `top_k`) — sending either returns a
// 400. Use adaptive thinking with `output_config.effort` instead.
const CLAUDE_OPUS_4_7 = {
  name: 'claude-opus-4-7',
  id: 'claude-opus-4-7',
  context_window: 1_000_000,
  max_output_tokens: 128_000,
  supports: {
    input: ['text', 'image', 'document'],
    extended_thinking: false,
    adaptive_thinking: true,
    priority_tier: true,
    tools: [
      'web_search',
      'web_fetch',
      'code_execution',
      'computer_use',
      'bash',
      'text_editor',
      'memory',
    ],
  },
  pricing: {
    input: {
      normal: 5,
      cached: 0.5,
    },
    output: {
      normal: 25,
    },
  },
} as const satisfies ModelMeta<
  AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicAdaptiveOrDisabledThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicMaxTokensOptions &
    AnthropicOutputConfigOptions
>

// Claude Opus 4.8 keeps the same request surface as Opus 4.7: adaptive
// thinking only (budget_tokens 400s), no sampling parameters.
const CLAUDE_OPUS_4_8 = {
  name: 'claude-opus-4-8',
  id: 'claude-opus-4-8',
  context_window: 1_000_000,
  max_output_tokens: 128_000,
  supports: {
    input: ['text', 'image', 'document'],
    extended_thinking: false,
    adaptive_thinking: true,
    priority_tier: true,
    tools: [
      'web_search',
      'web_fetch',
      'code_execution',
      'computer_use',
      'bash',
      'text_editor',
      'memory',
    ],
  },
  pricing: {
    input: {
      normal: 5,
      cached: 0.5,
    },
    output: {
      normal: 25,
    },
  },
} as const satisfies ModelMeta<
  AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicAdaptiveOrDisabledThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicMaxTokensOptions &
    AnthropicOutputConfigOptions
>

// Claude Fable 5: thinking is always on — the only accepted explicit
// `thinking` config is `{type: 'adaptive'}` (disabled/budget_tokens 400),
// and the sampling parameters (`temperature`, `top_p`, `top_k`) are
// rejected. Its provider options therefore use the adaptive-only thinking
// shape and `max_tokens` without the sampling knobs.
const CLAUDE_FABLE_5 = {
  name: 'claude-fable-5',
  id: 'claude-fable-5',
  context_window: 1_000_000,
  max_output_tokens: 128_000,
  supports: {
    input: ['text', 'image', 'document'],
    extended_thinking: false,
    adaptive_thinking: true,
    priority_tier: true,
    tools: [
      'web_search',
      'web_fetch',
      'code_execution',
      'computer_use',
      'bash',
      'text_editor',
      'memory',
    ],
  },
  pricing: {
    input: {
      normal: 10,
      cached: 1,
    },
    output: {
      normal: 50,
    },
  },
} as const satisfies ModelMeta<
  AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicAdaptiveOnlyThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicMaxTokensOptions &
    AnthropicOutputConfigOptions
>

// Claude Sonnet 5: adaptive thinking is the default (omitting `thinking`
// runs adaptive); `{type: 'disabled'}` opts out, but the manual
// `{type: 'enabled', budget_tokens}` shape and non-default sampling
// parameters (`temperature`, `top_p`, `top_k`) are rejected with a 400.
// Pricing below is the sticker $3/$15 per MTok (an introductory $2/$10
// applies through 2026-08-31).
const CLAUDE_SONNET_5 = {
  name: 'claude-sonnet-5',
  id: 'claude-sonnet-5',
  context_window: 1_000_000,
  max_output_tokens: 128_000,
  supports: {
    input: ['text', 'image', 'document'],
    extended_thinking: false,
    adaptive_thinking: true,
    priority_tier: true,
    tools: [
      'web_search',
      'web_fetch',
      'code_execution',
      'computer_use',
      'bash',
      'text_editor',
      'memory',
    ],
  },
  pricing: {
    input: {
      normal: 3,
      cached: 0.3,
    },
    output: {
      normal: 15,
    },
  },
} as const satisfies ModelMeta<
  AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicAdaptiveOrDisabledThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicMaxTokensOptions &
    AnthropicOutputConfigOptions
>

/**
 * Model ids accepted by the Anthropic text adapter.
 *
 * Every id here resolves against the first-party Anthropic API
 * (`GET /v1/models/{id}`). Retired models (Claude 3.x, Sonnet 3.7,
 * Opus 4 / Sonnet 4) and the `-fast` variant ids (fast mode is requested
 * via the `speed` parameter, not a model id) were removed after Anthropic
 * turned them off.
 */
export const ANTHROPIC_MODELS = [
  CLAUDE_OPUS_4_6.id,
  CLAUDE_OPUS_4_5.id,
  CLAUDE_SONNET_4_6.id,
  CLAUDE_SONNET_4_5.id,
  CLAUDE_HAIKU_4_5.id,
  CLAUDE_OPUS_4_1.id,

  CLAUDE_OPUS_4_7.id,
  CLAUDE_OPUS_4_8.id,

  CLAUDE_FABLE_5.id,
  CLAUDE_SONNET_5.id,
] as const

/**
 * Fallback `max_tokens` ceiling for a model whose metadata carries no
 * `max_output_tokens` (e.g. an unrecognized model id). Anthropic's Messages
 * API *requires* `max_tokens`, so the adapter must always send a value. 64K is
 * the output ceiling of the current mainstream Claude tier (Sonnet/Haiku 4.5),
 * so it's a sane default for an unknown — almost certainly modern — model and
 * avoids silently truncating long generations (issue #849). Recognized models
 * use their exact `max_output_tokens` from {@link ANTHROPIC_MODEL_MAX_OUTPUT_TOKENS}
 * (e.g. 128K for Opus), so this fallback only ever applies to ids not in the
 * map.
 */
export const ANTHROPIC_DEFAULT_MAX_OUTPUT_TOKENS = 64_000

/**
 * Runtime lookup of each model's maximum output-token ceiling, keyed by model
 * id. Lets the text adapter default the required `max_tokens` request field to
 * the model's real ceiling when the caller doesn't specify one, rather than a
 * low constant that truncates responses mid-stream (issue #849).
 *
 * Kept in sync with {@link ANTHROPIC_MODELS} by `scripts/sync-provider-models.ts`
 * — when that script adds a model it also inserts the model's `max_output_tokens`
 * here, so a freshly-synced model resolves to its real ceiling rather than the
 * fallback above.
 */
const ANTHROPIC_MODEL_MAX_OUTPUT_TOKENS: Record<string, number> = {
  [CLAUDE_OPUS_4_6.id]: CLAUDE_OPUS_4_6.max_output_tokens,
  [CLAUDE_OPUS_4_5.id]: CLAUDE_OPUS_4_5.max_output_tokens,
  [CLAUDE_SONNET_4_6.id]: CLAUDE_SONNET_4_6.max_output_tokens,
  [CLAUDE_SONNET_4_5.id]: CLAUDE_SONNET_4_5.max_output_tokens,
  [CLAUDE_HAIKU_4_5.id]: CLAUDE_HAIKU_4_5.max_output_tokens,
  [CLAUDE_OPUS_4_1.id]: CLAUDE_OPUS_4_1.max_output_tokens,
  [CLAUDE_OPUS_4_7.id]: CLAUDE_OPUS_4_7.max_output_tokens,
  [CLAUDE_OPUS_4_8.id]: CLAUDE_OPUS_4_8.max_output_tokens,
  [CLAUDE_FABLE_5.id]: CLAUDE_FABLE_5.max_output_tokens,
  [CLAUDE_SONNET_5.id]: CLAUDE_SONNET_5.max_output_tokens,
}

/**
 * Largest `max_tokens` the Anthropic SDK permits on a **non-streaming**
 * request. The SDK refuses to make a non-streaming call it estimates could
 * exceed its 10-minute timeout, computed as
 * `(60min * max_tokens) / 128_000 > 10min` — i.e. it throws
 * `"Streaming is required for operations that may take longer than 10 minutes"`
 * once `max_tokens > 128_000 * 10 / 60 ≈ 21_333`
 * (`@anthropic-ai/sdk`'s `calculateNonstreamingTimeout`). The text adapter's
 * only non-streaming call is the forced-tool `structuredOutput()` request, so
 * its defaulted ceiling must stay at or below this; the streaming chat path
 * keeps the model's full {@link getAnthropicDefaultMaxTokens} ceiling. We sit
 * just under the boundary (`21_333` would round-trip to exactly 10min). This
 * caps only the *default* — an explicit oversized `max_tokens` from the caller
 * still surfaces the SDK's "use streaming" error, which is the correct signal.
 */
export const ANTHROPIC_MAX_NONSTREAMING_TOKENS = 21_000

/**
 * Resolve the default `max_tokens` for a model: its known `max_output_tokens`
 * ceiling, or {@link ANTHROPIC_DEFAULT_MAX_OUTPUT_TOKENS} for unknown models.
 * Callers that pass an explicit `max_tokens` bypass this entirely.
 *
 * Pass `stream: false` for non-streaming requests (the `structuredOutput()`
 * path): the result is then clamped to {@link ANTHROPIC_MAX_NONSTREAMING_TOKENS}
 * so the defaulted ceiling doesn't trip the SDK's non-streaming 10-minute guard
 * (issue #849). Streaming requests (the default) are unaffected and get the
 * model's full ceiling.
 */
export function getAnthropicDefaultMaxTokens(
  model: string,
  { stream = true }: { stream?: boolean } = {},
): number {
  const ceiling =
    ANTHROPIC_MODEL_MAX_OUTPUT_TOKENS[model] ??
    ANTHROPIC_DEFAULT_MAX_OUTPUT_TOKENS
  return stream ? ceiling : Math.min(ceiling, ANTHROPIC_MAX_NONSTREAMING_TOKENS)
}

/**
 * Anthropic models that support combining `tools` + JSON-Schema-constrained
 * output in a single streaming Messages request (per issue #605). GA'd
 * 2026-01-29 for Claude 4.5+ via `output_format` on the beta messages
 * endpoint. Older Claude models still need the forced-tool-use workaround
 * in `structuredOutput`.
 */
export const ANTHROPIC_COMBINED_TOOLS_AND_SCHEMA_MODELS = new Set<string>([
  CLAUDE_OPUS_4_5.id,
  CLAUDE_OPUS_4_6.id,
  CLAUDE_OPUS_4_7.id,
  CLAUDE_OPUS_4_8.id,
  CLAUDE_FABLE_5.id,
  CLAUDE_SONNET_5.id,
  CLAUDE_SONNET_4_5.id,
  CLAUDE_SONNET_4_6.id,
  CLAUDE_HAIKU_4_5.id,
])

// const ANTHROPIC_IMAGE_MODELS = [] as const
// const ANTHROPIC_EMBEDDING_MODELS = [] as const
// const ANTHROPIC_AUDIO_MODELS = [] as const
// const ANTHROPIC_VIDEO_MODELS = [] as const

export type AnthropicChatModel = (typeof ANTHROPIC_MODELS)[number]
// Manual type map for per-model provider options
// Models are differentiated by which thinking shapes and sampling
// parameters the API accepts.
export type AnthropicChatModelProviderOptionsByName = {
  // 4.6 generation: adaptive thinking plus the deprecated budget-based
  // shape; sampling parameters still accepted.
  [CLAUDE_OPUS_4_6.id]: AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicAdaptiveThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions
  [CLAUDE_SONNET_4_6.id]: AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicAdaptiveThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions

  // Pre-4.6 models: budget-based extended thinking and sampling parameters.
  [CLAUDE_OPUS_4_5.id]: AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions
  [CLAUDE_SONNET_4_5.id]: AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions
  [CLAUDE_HAIKU_4_5.id]: AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions
  [CLAUDE_OPUS_4_1.id]: AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions

  // Opus 4.7/4.8: adaptive thinking (or explicit disable), no
  // budget_tokens, no sampling parameters — see the constants above.
  [CLAUDE_OPUS_4_7.id]: AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicAdaptiveOrDisabledThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicMaxTokensOptions &
    AnthropicOutputConfigOptions
  [CLAUDE_OPUS_4_8.id]: AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicAdaptiveOrDisabledThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicMaxTokensOptions &
    AnthropicOutputConfigOptions

  // Claude Fable 5: thinking always on (adaptive-only config); sampling
  // parameters removed — see the CLAUDE_FABLE_5 constant above.
  [CLAUDE_FABLE_5.id]: AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicAdaptiveOnlyThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicMaxTokensOptions &
    AnthropicOutputConfigOptions
  // Claude Sonnet 5: adaptive thinking by default, explicit disable
  // allowed; no budget_tokens, no sampling parameters — see the
  // CLAUDE_SONNET_5 constant above.
  [CLAUDE_SONNET_5.id]: AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicAdaptiveOrDisabledThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicMaxTokensOptions &
    AnthropicOutputConfigOptions
}

export type AnthropicChatModelToolCapabilitiesByName = {
  [CLAUDE_OPUS_4_6.id]: typeof CLAUDE_OPUS_4_6.supports.tools
  [CLAUDE_OPUS_4_5.id]: typeof CLAUDE_OPUS_4_5.supports.tools
  [CLAUDE_SONNET_4_6.id]: typeof CLAUDE_SONNET_4_6.supports.tools
  [CLAUDE_SONNET_4_5.id]: typeof CLAUDE_SONNET_4_5.supports.tools
  [CLAUDE_HAIKU_4_5.id]: typeof CLAUDE_HAIKU_4_5.supports.tools
  [CLAUDE_OPUS_4_1.id]: typeof CLAUDE_OPUS_4_1.supports.tools
  [CLAUDE_OPUS_4_7.id]: typeof CLAUDE_OPUS_4_7.supports.tools
  [CLAUDE_OPUS_4_8.id]: typeof CLAUDE_OPUS_4_8.supports.tools
  [CLAUDE_FABLE_5.id]: typeof CLAUDE_FABLE_5.supports.tools
  [CLAUDE_SONNET_5.id]: typeof CLAUDE_SONNET_5.supports.tools
}

/**
 * Type-only map from chat model name to its supported input modalities.
 * All Anthropic Claude models support text, image, and document (PDF) input.
 * Used by the core AI types to constrain ContentPart types based on the selected model.
 * Note: These must be inlined as readonly arrays (not typeof) because the model
 * constants are not exported and typeof references don't work in .d.ts files
 * when consumed by external packages.
 *
 * @see https://docs.anthropic.com/claude/docs/vision
 * @see https://docs.anthropic.com/claude/docs/pdf-support
 */
export type AnthropicModelInputModalitiesByName = {
  [CLAUDE_OPUS_4_6.id]: typeof CLAUDE_OPUS_4_6.supports.input
  [CLAUDE_OPUS_4_5.id]: typeof CLAUDE_OPUS_4_5.supports.input
  [CLAUDE_SONNET_4_6.id]: typeof CLAUDE_SONNET_4_6.supports.input
  [CLAUDE_SONNET_4_5.id]: typeof CLAUDE_SONNET_4_5.supports.input
  [CLAUDE_HAIKU_4_5.id]: typeof CLAUDE_HAIKU_4_5.supports.input
  [CLAUDE_OPUS_4_1.id]: typeof CLAUDE_OPUS_4_1.supports.input
  [CLAUDE_OPUS_4_7.id]: typeof CLAUDE_OPUS_4_7.supports.input
  [CLAUDE_OPUS_4_8.id]: typeof CLAUDE_OPUS_4_8.supports.input
  [CLAUDE_FABLE_5.id]: typeof CLAUDE_FABLE_5.supports.input
  [CLAUDE_SONNET_5.id]: typeof CLAUDE_SONNET_5.supports.input
}
