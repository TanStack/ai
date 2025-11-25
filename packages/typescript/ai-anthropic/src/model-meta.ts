import type {
  AnthropicContainerOptions,
  AnthropicContextManagementOptions,
  AnthropicMCPOptions,
  AnthropicServiceTierOptions,
  AnthropicStopSequencesOptions,
  AnthropicThinkingOptions,
  AnthropicToolChoiceOptions,
  AnthropicSamplingOptions,
} from "./text/text-provider-options";

interface ModelMeta<
  TProviderOptions = unknown,
  TToolCapabilities = unknown,
  TMessageCapabilities = unknown
> {
  name: string;
  id: string;
  supports: {
    extended_thinking?: boolean;
    priority_tier?: boolean;

  };
  context_window?: number;
  max_output_tokens?: number;
  knowledge_cutoff?: string;
  pricing: {
    input: {
      normal: number;
      cached?: number;
    };
    output: {
      normal: number;
    };
  };
  /**
   * Type-level description of which provider options this model supports.
   */
  providerOptions?: TProviderOptions;
  /**
   * Type-level description of which tool capabilities this model supports.
   */
  toolCapabilities?: TToolCapabilities;
  /**
   * Type-level description of which message/input capabilities this model supports.
   */
  messageCapabilities?: TMessageCapabilities;
}
const CLAUDE_SONNET_4_5 = {
  name: "claude-sonnet-4-5",
  id: "claude-sonnet-4-5-20250929",
  context_window: 200_000,
  max_output_tokens: 64_000,
  knowledge_cutoff: "2025-09-29",
  pricing: {
    input: {
      normal: 3,
    },
    output: {
      normal: 15
    }
  },
  supports: {
    extended_thinking: true,
    priority_tier: true
  }
} as const satisfies ModelMeta<
  AnthropicContainerOptions &
  AnthropicContextManagementOptions &
  AnthropicMCPOptions &
  AnthropicServiceTierOptions &
  AnthropicStopSequencesOptions &
  AnthropicThinkingOptions &
  AnthropicToolChoiceOptions &
  AnthropicSamplingOptions
>;

const CLAUDE_HAIKU_4_5 = {
  name: "claude-haiku-4-5",
  id: "claude-haiku-4-5-20251001",
  context_window: 200_000,
  max_output_tokens: 64_000,
  knowledge_cutoff: "2025-10-01",
  pricing: {
    input: {
      normal: 1,
    },
    output: {
      normal: 5
    }
  },
  supports: {
    extended_thinking: true,
    priority_tier: true
  }
} as const satisfies ModelMeta<
  AnthropicContainerOptions &
  AnthropicContextManagementOptions &
  AnthropicMCPOptions &
  AnthropicServiceTierOptions &
  AnthropicStopSequencesOptions &
  AnthropicThinkingOptions &
  AnthropicToolChoiceOptions &
  AnthropicSamplingOptions
>;

const CLAUDE_OPUS_4_1 = {
  name: "claude-opus-4-1",
  id: "claude-opus-4-1-20250805",
  context_window: 200_000,
  max_output_tokens: 64_000,
  knowledge_cutoff: "2025-08-05",
  pricing: {
    input: {
      normal: 15,
    },
    output: {
      normal: 75
    }
  },
  supports: {
    extended_thinking: true,
    priority_tier: true
  }
} as const satisfies ModelMeta<
  AnthropicContainerOptions &
  AnthropicContextManagementOptions &
  AnthropicMCPOptions &
  AnthropicServiceTierOptions &
  AnthropicStopSequencesOptions &
  AnthropicThinkingOptions &
  AnthropicToolChoiceOptions &
  AnthropicSamplingOptions
>;

const CLAUDE_OPUS_4_5 = {
  name: "claude-opus-4-5",
  id: "claude-opus-4-5-20251101",
  context_window: 200_000,
  max_output_tokens: 32_000,
  knowledge_cutoff: "2025-11-01",
  pricing: {
    input: {
      normal: 15,
    },
    output: {
      normal: 75
    }
  },
  supports: {
    extended_thinking: true,
    priority_tier: true
  }
} as const satisfies ModelMeta<
  AnthropicContainerOptions &
  AnthropicContextManagementOptions &
  AnthropicMCPOptions &
  AnthropicServiceTierOptions &
  AnthropicStopSequencesOptions &
  AnthropicThinkingOptions &
  AnthropicToolChoiceOptions &
  AnthropicSamplingOptions
>;

const CLAUDE_SONNET_4 = {
  name: "claude-sonnet-4",
  id: "claude-sonnet-4-20250514",
  context_window: 200_000,
  max_output_tokens: 64_000,
  knowledge_cutoff: "2025-05-14",
  pricing: {
    input: {
      normal: 3,
    },
    output: {
      normal: 15
    }
  },
  supports: {
    extended_thinking: true,
    priority_tier: true
  }
} as const satisfies ModelMeta<
  AnthropicContainerOptions &
  AnthropicContextManagementOptions &
  AnthropicMCPOptions &
  AnthropicServiceTierOptions &
  AnthropicStopSequencesOptions &
  AnthropicThinkingOptions &
  AnthropicToolChoiceOptions &
  AnthropicSamplingOptions
>;

const CLAUDE_SONNET_3_7 = {
  name: "claude-sonnet-3-7",
  id: "claude-3-7-sonnet-20250219",
  max_output_tokens: 64_000,
  knowledge_cutoff: "2025-05-14",
  pricing: {
    input: {
      normal: 3,
    },
    output: {
      normal: 15
    }
  },
  supports: {
    extended_thinking: true,
    priority_tier: true
  }
} as const satisfies ModelMeta<
  AnthropicContainerOptions &
  AnthropicContextManagementOptions &
  AnthropicMCPOptions &
  AnthropicServiceTierOptions &
  AnthropicStopSequencesOptions &
  AnthropicThinkingOptions &
  AnthropicToolChoiceOptions &
  AnthropicSamplingOptions
>;

const CLAUDE_OPUS_4 = {
  name: "claude-opus-4",
  id: "claude-opus-4-20250514",
  context_window: 200_000,
  max_output_tokens: 32_000,
  knowledge_cutoff: "2025-05-14",
  pricing: {
    input: {
      normal: 15,
    },
    output: {
      normal: 75
    }
  },
  supports: {
    extended_thinking: true,
    priority_tier: true
  }
} as const satisfies ModelMeta<
  AnthropicContainerOptions &
  AnthropicContextManagementOptions &
  AnthropicMCPOptions &
  AnthropicServiceTierOptions &
  AnthropicStopSequencesOptions &
  AnthropicThinkingOptions &
  AnthropicToolChoiceOptions &
  AnthropicSamplingOptions
>;

const CLAUDE_HAIKU_3_5 = {
  name: "claude-haiku-3-5",
  id: "claude-3-5-haiku-20241022",
  context_window: 200_000,
  max_output_tokens: 8_000,
  knowledge_cutoff: "2025-10-22",
  pricing: {
    input: {
      normal: 0.8,
    },
    output: {
      normal: 4
    }
  },
  supports: {
    extended_thinking: false,
    priority_tier: true
  }
} as const satisfies ModelMeta<
  AnthropicContainerOptions &
  AnthropicContextManagementOptions &
  AnthropicMCPOptions &
  AnthropicServiceTierOptions &
  AnthropicStopSequencesOptions &
  AnthropicThinkingOptions &
  AnthropicToolChoiceOptions &
  AnthropicSamplingOptions
>;

const CLAUDE_HAIKU_3 = {
  name: "claude-haiku-3",
  id: "claude-3-haiku-20240307",
  context_window: 200_000,
  max_output_tokens: 4_000,
  knowledge_cutoff: "2024-03-07",
  pricing: {
    input: {
      normal: 0.25,
    },
    output: {
      normal: 1.25
    }
  },
  supports: {
    extended_thinking: false,
    priority_tier: false
  }
} as const satisfies ModelMeta<
  AnthropicContainerOptions &
  AnthropicContextManagementOptions &
  AnthropicMCPOptions &
  AnthropicServiceTierOptions &
  AnthropicStopSequencesOptions &
  AnthropicThinkingOptions &
  AnthropicToolChoiceOptions &
  AnthropicSamplingOptions
>;

export const ANTHROPIC_MODEL_META = {
  [CLAUDE_OPUS_4_5.name]: CLAUDE_OPUS_4_5,
  [CLAUDE_SONNET_4_5.name]: CLAUDE_SONNET_4_5,
  [CLAUDE_HAIKU_4_5.name]: CLAUDE_HAIKU_4_5,
  [CLAUDE_OPUS_4_1.name]: CLAUDE_OPUS_4_1,
  [CLAUDE_SONNET_4.name]: CLAUDE_SONNET_4,
  [CLAUDE_SONNET_3_7.name]: CLAUDE_SONNET_3_7,
  [CLAUDE_OPUS_4.name]: CLAUDE_OPUS_4,
  [CLAUDE_HAIKU_3_5.name]: CLAUDE_HAIKU_3_5,
  [CLAUDE_HAIKU_3.name]: CLAUDE_HAIKU_3,
} as const;

export type AnthropicModelMetaMap = typeof ANTHROPIC_MODEL_META;

export type AnthropicModelProviderOptions<
  TModel extends keyof AnthropicModelMetaMap
> = AnthropicModelMetaMap[TModel] extends ModelMeta<infer TProviderOptions, any, any>
  ? TProviderOptions
  : unknown;

export type AnthropicModelToolCapabilities<
  TModel extends keyof AnthropicModelMetaMap
> = AnthropicModelMetaMap[TModel] extends ModelMeta<any, infer TToolCapabilities, any>
  ? TToolCapabilities
  : unknown;

export type AnthropicModelMessageCapabilities<
  TModel extends keyof AnthropicModelMetaMap
> = AnthropicModelMetaMap[TModel] extends ModelMeta<any, any, infer TMessageCapabilities>
  ? TMessageCapabilities
  : unknown;

export const ANTHROPIC_MODELS = [
  CLAUDE_OPUS_4_5.id,
  CLAUDE_SONNET_4_5.id,
  CLAUDE_HAIKU_4_5.id,
  CLAUDE_OPUS_4_1.id,
  CLAUDE_SONNET_4.id,
  CLAUDE_SONNET_3_7.id,
  CLAUDE_OPUS_4.id,
  CLAUDE_HAIKU_3_5.id,
  CLAUDE_HAIKU_3.id
] as const;

export const ANTHROPIC_IMAGE_MODELS = [] as const;
export const ANTHROPIC_EMBEDDING_MODELS = [] as const;
export const ANTHROPIC_AUDIO_MODELS = [] as const;
export const ANTHROPIC_VIDEO_MODELS = [] as const;

export type AnthropicModel = (typeof ANTHROPIC_MODELS)[number];

// Manual type map for per-model provider options
// Models are differentiated by extended_thinking and priority_tier support
export type AnthropicChatModelProviderOptionsByName = {
  // Models with both extended_thinking and priority_tier
  [CLAUDE_OPUS_4_5.id]: AnthropicContainerOptions & AnthropicContextManagementOptions & AnthropicMCPOptions & AnthropicServiceTierOptions & AnthropicStopSequencesOptions & AnthropicThinkingOptions & AnthropicToolChoiceOptions & AnthropicSamplingOptions;
  [CLAUDE_SONNET_4_5.id]: AnthropicContainerOptions & AnthropicContextManagementOptions & AnthropicMCPOptions & AnthropicServiceTierOptions & AnthropicStopSequencesOptions & AnthropicThinkingOptions & AnthropicToolChoiceOptions & AnthropicSamplingOptions;
  [CLAUDE_HAIKU_4_5.id]: AnthropicContainerOptions & AnthropicContextManagementOptions & AnthropicMCPOptions & AnthropicServiceTierOptions & AnthropicStopSequencesOptions & AnthropicThinkingOptions & AnthropicToolChoiceOptions & AnthropicSamplingOptions;
  [CLAUDE_OPUS_4_1.id]: AnthropicContainerOptions & AnthropicContextManagementOptions & AnthropicMCPOptions & AnthropicServiceTierOptions & AnthropicStopSequencesOptions & AnthropicThinkingOptions & AnthropicToolChoiceOptions & AnthropicSamplingOptions;
  [CLAUDE_SONNET_4.id]: AnthropicContainerOptions & AnthropicContextManagementOptions & AnthropicMCPOptions & AnthropicServiceTierOptions & AnthropicStopSequencesOptions & AnthropicThinkingOptions & AnthropicToolChoiceOptions & AnthropicSamplingOptions;
  [CLAUDE_SONNET_3_7.id]: AnthropicContainerOptions & AnthropicContextManagementOptions & AnthropicMCPOptions & AnthropicServiceTierOptions & AnthropicStopSequencesOptions & AnthropicThinkingOptions & AnthropicToolChoiceOptions & AnthropicSamplingOptions;
  [CLAUDE_OPUS_4.id]: AnthropicContainerOptions & AnthropicContextManagementOptions & AnthropicMCPOptions & AnthropicServiceTierOptions & AnthropicStopSequencesOptions & AnthropicThinkingOptions & AnthropicToolChoiceOptions & AnthropicSamplingOptions;

  // Model with priority_tier but NO extended_thinking
  [CLAUDE_HAIKU_3_5.id]: AnthropicContainerOptions & AnthropicContextManagementOptions & AnthropicMCPOptions & AnthropicServiceTierOptions & AnthropicStopSequencesOptions & AnthropicToolChoiceOptions & AnthropicSamplingOptions;

  // Model with neither extended_thinking nor priority_tier
  [CLAUDE_HAIKU_3.id]: AnthropicContainerOptions & AnthropicContextManagementOptions & AnthropicMCPOptions & AnthropicStopSequencesOptions & AnthropicToolChoiceOptions & AnthropicSamplingOptions;
};