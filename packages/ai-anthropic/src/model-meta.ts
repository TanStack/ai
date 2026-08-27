import type {
  AnthropicAdaptiveOnlyThinkingOptions,
  AnthropicAdaptiveOrDisabledThinkingOptions,
  AnthropicAdaptiveThinkingOptions,
  AnthropicCacheControlOptions,
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
  providerOptions?: TProviderOptions
  toolCapabilities?: TToolCapabilities
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
  AnthropicCacheControlOptions &
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
  AnthropicCacheControlOptions &
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
  AnthropicCacheControlOptions &
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
  AnthropicCacheControlOptions &
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
  AnthropicCacheControlOptions &
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
  AnthropicCacheControlOptions &
    AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions
>

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
  AnthropicCacheControlOptions &
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
  AnthropicCacheControlOptions &
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
  AnthropicCacheControlOptions &
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
  AnthropicCacheControlOptions &
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

const CLAUDE_OPUS_5 = {
  name: 'claude-opus-5',
  id: 'claude-opus-5',
  context_window: 1_000_000,
  max_output_tokens: 128_000,
  supports: {
    input: ['text', 'image', 'document'],
    tools: [],
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
    AnthropicThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions
>

const CLAUDE_OPUS_5_FAST = {
  name: 'claude-opus-5-fast',
  id: 'claude-opus-5-fast',
  context_window: 1_000_000,
  max_output_tokens: 128_000,
  supports: {
    input: ['text', 'image', 'document'],
    tools: [],
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
    AnthropicThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions
>

export const ANTHROPIC_MODELS = [
  CLAUDE_OPUS_5.id,
  CLAUDE_OPUS_5_FAST.id,
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

export const ANTHROPIC_VERTEX_CHAT_MODELS = [
  CLAUDE_OPUS_5.id,
  CLAUDE_SONNET_5.id,
  CLAUDE_FABLE_5.id,
  CLAUDE_OPUS_4_8.id,
  CLAUDE_OPUS_4_7.id,
  CLAUDE_OPUS_4_6.id,
  CLAUDE_SONNET_4_6.id,
  CLAUDE_OPUS_4_5.id,
  CLAUDE_SONNET_4_5.id,
  CLAUDE_OPUS_4_1.id,
  CLAUDE_HAIKU_4_5.id,
] as const

export type AnthropicVertexChatModel =
  (typeof ANTHROPIC_VERTEX_CHAT_MODELS)[number]

export const ANTHROPIC_DEFAULT_MAX_OUTPUT_TOKENS = 64_000

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
  [CLAUDE_OPUS_5.id]: CLAUDE_OPUS_5.max_output_tokens,
  [CLAUDE_OPUS_5_FAST.id]: CLAUDE_OPUS_5_FAST.max_output_tokens,
}

export const ANTHROPIC_MAX_NONSTREAMING_TOKENS = 21_000

export function getAnthropicDefaultMaxTokens(
  model: string,
  { stream = true }: { stream?: boolean } = {},
): number {
  const ceiling =
    ANTHROPIC_MODEL_MAX_OUTPUT_TOKENS[model] ??
    ANTHROPIC_DEFAULT_MAX_OUTPUT_TOKENS
  return stream ? ceiling : Math.min(ceiling, ANTHROPIC_MAX_NONSTREAMING_TOKENS)
}

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

export type AnthropicChatModel = (typeof ANTHROPIC_MODELS)[number]
export type AnthropicChatModelProviderOptionsByName = {
  // 4.6 generation: adaptive thinking plus the deprecated budget-based
  // shape; sampling parameters still accepted.
  [CLAUDE_OPUS_4_6.id]: AnthropicCacheControlOptions &
    AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicAdaptiveThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions
  [CLAUDE_SONNET_4_6.id]: AnthropicCacheControlOptions &
    AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicAdaptiveThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions

  // Pre-4.6 models: budget-based extended thinking and sampling parameters.
  [CLAUDE_OPUS_4_5.id]: AnthropicCacheControlOptions &
    AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions
  [CLAUDE_SONNET_4_5.id]: AnthropicCacheControlOptions &
    AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions
  [CLAUDE_HAIKU_4_5.id]: AnthropicCacheControlOptions &
    AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions
  [CLAUDE_OPUS_4_1.id]: AnthropicCacheControlOptions &
    AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions

  // Opus 4.7/4.8: adaptive thinking (or explicit disable), no
  // budget_tokens, no sampling parameters — see the constants above.
  [CLAUDE_OPUS_4_7.id]: AnthropicCacheControlOptions &
    AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicAdaptiveOrDisabledThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicMaxTokensOptions &
    AnthropicOutputConfigOptions
  [CLAUDE_OPUS_4_8.id]: AnthropicCacheControlOptions &
    AnthropicContainerOptions &
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
  [CLAUDE_FABLE_5.id]: AnthropicCacheControlOptions &
    AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicAdaptiveOnlyThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicMaxTokensOptions &
    AnthropicOutputConfigOptions
  [CLAUDE_SONNET_5.id]: AnthropicCacheControlOptions &
    AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicAdaptiveOrDisabledThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicMaxTokensOptions &
    AnthropicOutputConfigOptions
  [CLAUDE_OPUS_5.id]: AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions
  [CLAUDE_OPUS_5_FAST.id]: AnthropicContainerOptions &
    AnthropicContextManagementOptions &
    AnthropicMCPOptions &
    AnthropicServiceTierOptions &
    AnthropicStopSequencesOptions &
    AnthropicThinkingOptions &
    AnthropicToolChoiceOptions &
    AnthropicSamplingOptions
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
  [CLAUDE_OPUS_5.id]: typeof CLAUDE_OPUS_5.supports.tools
  [CLAUDE_OPUS_5_FAST.id]: typeof CLAUDE_OPUS_5_FAST.supports.tools
}

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
  [CLAUDE_OPUS_5.id]: typeof CLAUDE_OPUS_5.supports.input
  [CLAUDE_OPUS_5_FAST.id]: typeof CLAUDE_OPUS_5_FAST.supports.input
}
