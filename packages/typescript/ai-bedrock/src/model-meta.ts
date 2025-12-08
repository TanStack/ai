/**
 * Bedrock model metadata and provider options
 *
 * ## Inference Profiles (Cross-Region Inference)
 *
 * AWS Bedrock uses "inference profiles" to enable cross-region model invocation.
 * For newer Claude models (Claude 3.5 Sonnet v2, Claude 3.7 Sonnet, Claude 4 series),
 * **inference profiles are required** - direct model IDs will return an error.
 *
 * To use inference profiles, pass the full inference profile ID as the model:
 *
 * ```typescript
 * await bedrock.chat({
 *   model: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
 *   messages: [...]
 * });
 * ```
 *
 * ### Model ID Formats
 *
 * | Format | Example | Use Case |
 * |--------|---------|----------|
 * | Direct | `anthropic.claude-3-haiku-20240307-v1:0` | Legacy models in single region |
 * | US Profile | `us.anthropic.claude-3-5-sonnet-20241022-v2:0` | US cross-region |
 * | EU Profile | `eu.anthropic.claude-3-5-sonnet-20241022-v2:0` | EU cross-region (GDPR compliance) |
 * | APAC Profile | `apac.anthropic.claude-sonnet-4-20250514-v1:0` | Asia Pacific cross-region |
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles.html
 */

import type {
  BedrockAnthropicOptions,
  BedrockAnthropicReasoningOptions,
  BedrockProviderOptions,
  BedrockReasoningEffortOptions,
} from './text/text-provider-options'

/**
 * Model metadata structure aligned with AWS Bedrock Converse API supported features.
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference-supported-models-features.html
 */
interface ModelMeta<TProviderOptions = unknown> {
  name: string
  id: string
  supports: {
    converse: boolean
    streaming: boolean
    systemPrompts: boolean
    documentChat: boolean
    vision: boolean
    toolUse: boolean
    streamingToolUse: boolean
    guardrails: boolean
    s3Links: boolean
    reasoning?: boolean
  }
  contextWindow?: number
  maxOutputTokens?: number
  providerOptions?: TProviderOptions
}

const NOVA_LITE = {
  name: 'Nova Lite',
  id: 'amazon.nova-lite-v1:0',
  contextWindow: 300_000,
  maxOutputTokens: 5_000,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: true,
    streamingToolUse: true,
    guardrails: true,
    s3Links: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const NOVA_MICRO = {
  name: 'Nova Micro',
  id: 'amazon.nova-micro-v1:0',
  contextWindow: 128_000,
  maxOutputTokens: 5_000,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: false,
    vision: false,
    toolUse: true,
    streamingToolUse: true,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const NOVA_PRO = {
  name: 'Nova Pro',
  id: 'amazon.nova-pro-v1:0',
  contextWindow: 300_000,
  maxOutputTokens: 5_000,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: true,
    streamingToolUse: true,
    guardrails: true,
    s3Links: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const US_NOVA_PREMIER = {
  name: 'Nova Premier',
  id: 'us.amazon.nova-premier-v1:0',
  contextWindow: 1_000_000,
  maxOutputTokens: 32_000,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: true,
    streamingToolUse: true,
    guardrails: true,
    s3Links: true,
    reasoning: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockReasoningEffortOptions>

const US_NOVA_2_LITE = {
  name: 'Nova 2 Lite',
  id: 'us.amazon.nova-2-lite-v1:0',
  contextWindow: 1_000_000,
  maxOutputTokens: 32_000,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: true,
    streamingToolUse: true,
    guardrails: true,
    s3Links: true,
    reasoning: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockReasoningEffortOptions>

const US_NOVA_2_SONIC = {
  name: 'Nova 2 Sonic',
  id: 'us.amazon.nova-2-sonic-v1:0',
  contextWindow: 1_000_000,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: false,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: false,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const CLAUDE_3_HAIKU = {
  name: 'Claude 3 Haiku',
  id: 'anthropic.claude-3-haiku-20240307-v1:0',
  contextWindow: 200_000,
  maxOutputTokens: 4_096,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: true,
    streamingToolUse: true,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockAnthropicOptions>

const CLAUDE_3_SONNET = {
  name: 'Claude 3 Sonnet',
  id: 'anthropic.claude-3-sonnet-20240229-v1:0',
  contextWindow: 200_000,
  maxOutputTokens: 4_096,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: true,
    streamingToolUse: true,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockAnthropicOptions>

const CLAUDE_3_OPUS = {
  name: 'Claude 3 Opus',
  id: 'anthropic.claude-3-opus-20240229-v1:0',
  contextWindow: 200_000,
  maxOutputTokens: 4_096,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: true,
    streamingToolUse: true,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockAnthropicOptions>

const CLAUDE_3_5_HAIKU = {
  name: 'Claude 3.5 Haiku',
  id: 'anthropic.claude-3-5-haiku-20241022-v1:0',
  contextWindow: 200_000,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: false,
    toolUse: true,
    streamingToolUse: true,
    guardrails: false,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockAnthropicOptions>

const CLAUDE_3_5_SONNET = {
  name: 'Claude 3.5 Sonnet',
  id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
  contextWindow: 200_000,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: true,
    streamingToolUse: true,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockAnthropicOptions>

const CLAUDE_3_5_SONNET_V2 = {
  name: 'Claude 3.5 Sonnet v2',
  id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
  contextWindow: 200_000,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: true,
    streamingToolUse: true,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockAnthropicOptions>

const CLAUDE_3_7_SONNET = {
  name: 'Claude 3.7 Sonnet',
  id: 'anthropic.claude-3-7-sonnet-20250219-v1:0',
  contextWindow: 200_000,
  maxOutputTokens: 64_000,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: true,
    streamingToolUse: true,
    guardrails: true,
    s3Links: false,
    reasoning: true,
  },
} as const satisfies ModelMeta<
  BedrockProviderOptions & BedrockAnthropicOptions & BedrockAnthropicReasoningOptions
>

const CLAUDE_HAIKU_4_5 = {
  name: 'Claude Haiku 4.5',
  id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
  contextWindow: 200_000,
  maxOutputTokens: 64_000,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: true,
    streamingToolUse: true,
    guardrails: false,
    s3Links: false,
    reasoning: true,
  },
} as const satisfies ModelMeta<
  BedrockProviderOptions & BedrockAnthropicOptions & BedrockAnthropicReasoningOptions
>

const CLAUDE_SONNET_4 = {
  name: 'Claude Sonnet 4',
  id: 'anthropic.claude-sonnet-4-20250514-v1:0',
  contextWindow: 200_000,
  maxOutputTokens: 64_000,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: true,
    streamingToolUse: true,
    guardrails: false,
    s3Links: false,
    reasoning: true,
  },
} as const satisfies ModelMeta<
  BedrockProviderOptions & BedrockAnthropicOptions & BedrockAnthropicReasoningOptions
>

const CLAUDE_SONNET_4_5 = {
  name: 'Claude Sonnet 4.5',
  id: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
  contextWindow: 200_000,
  maxOutputTokens: 64_000,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: true,
    streamingToolUse: true,
    guardrails: false,
    s3Links: false,
    reasoning: true,
  },
} as const satisfies ModelMeta<
  BedrockProviderOptions & BedrockAnthropicOptions & BedrockAnthropicReasoningOptions
>

const CLAUDE_OPUS_4 = {
  name: 'Claude Opus 4',
  id: 'anthropic.claude-opus-4-20250514-v1:0',
  contextWindow: 200_000,
  maxOutputTokens: 32_000,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: true,
    streamingToolUse: true,
    guardrails: false,
    s3Links: false,
    reasoning: true,
  },
} as const satisfies ModelMeta<
  BedrockProviderOptions & BedrockAnthropicOptions & BedrockAnthropicReasoningOptions
>

const CLAUDE_OPUS_4_1 = {
  name: 'Claude Opus 4.1',
  id: 'anthropic.claude-opus-4-1-20250805-v1:0',
  contextWindow: 200_000,
  maxOutputTokens: 64_000,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: true,
    streamingToolUse: true,
    guardrails: false,
    s3Links: false,
    reasoning: true,
  },
} as const satisfies ModelMeta<
  BedrockProviderOptions & BedrockAnthropicOptions & BedrockAnthropicReasoningOptions
>

const LLAMA_3_8B = {
  name: 'Llama 3 8B Instruct',
  id: 'meta.llama3-8b-instruct-v1:0',
  contextWindow: 8_192,
  maxOutputTokens: 2_048,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LLAMA_3_70B = {
  name: 'Llama 3 70B Instruct',
  id: 'meta.llama3-70b-instruct-v1:0',
  contextWindow: 8_192,
  maxOutputTokens: 2_048,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LLAMA_3_1_8B = {
  name: 'Llama 3.1 8B Instruct',
  id: 'meta.llama3-1-8b-instruct-v1:0',
  contextWindow: 128_000,
  maxOutputTokens: 2_048,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: false,
    toolUse: true,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LLAMA_3_1_70B = {
  name: 'Llama 3.1 70B Instruct',
  id: 'meta.llama3-1-70b-instruct-v1:0',
  contextWindow: 128_000,
  maxOutputTokens: 2_048,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: false,
    toolUse: true,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LLAMA_3_1_405B = {
  name: 'Llama 3.1 405B Instruct',
  id: 'meta.llama3-1-405b-instruct-v1:0',
  contextWindow: 128_000,
  maxOutputTokens: 2_048,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: false,
    toolUse: true,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LLAMA_3_2_1B = {
  name: 'Llama 3.2 1B Instruct',
  id: 'meta.llama3-2-1b-instruct-v1:0',
  contextWindow: 128_000,
  maxOutputTokens: 2_048,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LLAMA_3_2_3B = {
  name: 'Llama 3.2 3B Instruct',
  id: 'meta.llama3-2-3b-instruct-v1:0',
  contextWindow: 128_000,
  maxOutputTokens: 2_048,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LLAMA_3_2_11B = {
  name: 'Llama 3.2 11B Vision Instruct',
  id: 'meta.llama3-2-11b-instruct-v1:0',
  contextWindow: 128_000,
  maxOutputTokens: 2_048,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: true,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LLAMA_3_2_90B = {
  name: 'Llama 3.2 90B Vision Instruct',
  id: 'meta.llama3-2-90b-instruct-v1:0',
  contextWindow: 128_000,
  maxOutputTokens: 2_048,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: true,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LLAMA_3_3_70B = {
  name: 'Llama 3.3 70B Instruct',
  id: 'meta.llama3-3-70b-instruct-v1:0',
  contextWindow: 128_000,
  maxOutputTokens: 2_048,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: false,
    toolUse: true,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LLAMA_4_SCOUT = {
  name: 'Llama 4 Scout 17B Instruct',
  id: 'meta.llama4-scout-17b-instruct-v1:0',
  contextWindow: 3_500_000,
  maxOutputTokens: 16_384,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: true,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LLAMA_4_MAVERICK = {
  name: 'Llama 4 Maverick 17B Instruct',
  id: 'meta.llama4-maverick-17b-instruct-v1:0',
  contextWindow: 1_000_000,
  maxOutputTokens: 16_384,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: true,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MISTRAL_7B = {
  name: 'Mistral 7B Instruct',
  id: 'mistral.mistral-7b-instruct-v0:2',
  contextWindow: 32_768,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: false,
    documentChat: true,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MIXTRAL_8X7B = {
  name: 'Mixtral 8x7B Instruct',
  id: 'mistral.mixtral-8x7b-instruct-v0:1',
  contextWindow: 32_768,
  maxOutputTokens: 4_096,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: false,
    documentChat: true,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MISTRAL_LARGE_2402 = {
  name: 'Mistral Large (24.02)',
  id: 'mistral.mistral-large-2402-v1:0',
  contextWindow: 32_768,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: false,
    toolUse: true,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MISTRAL_LARGE_2407 = {
  name: 'Mistral Large (24.07)',
  id: 'mistral.mistral-large-2407-v1:0',
  contextWindow: 128_000,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: false,
    toolUse: true,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MISTRAL_SMALL_2402 = {
  name: 'Mistral Small (24.02)',
  id: 'mistral.mistral-small-2402-v1:0',
  contextWindow: 32_768,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: false,
    vision: false,
    toolUse: true,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const US_PIXTRAL_LARGE = {
  name: 'Pixtral Large (25.02)',
  id: 'us.mistral.pixtral-large-2502-v1:0',
  contextWindow: 128_000,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: true,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MISTRAL_LARGE_3 = {
  name: 'Mistral Large 3',
  id: 'mistral.mistral-large-3-675b-instruct',
  contextWindow: 128_000,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: true,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MINISTRAL_3_3B = {
  name: 'Ministral 3 3B',
  id: 'mistral.ministral-3-3b-instruct',
  contextWindow: 128_000,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MINISTRAL_3_8B = {
  name: 'Ministral 3 8B',
  id: 'mistral.ministral-3-8b-instruct',
  contextWindow: 128_000,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MINISTRAL_3_14B = {
  name: 'Ministral 3 14B',
  id: 'mistral.ministral-3-14b-instruct',
  contextWindow: 128_000,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MAGISTRAL_SMALL = {
  name: 'Magistral Small',
  id: 'mistral.magistral-small-2509',
  contextWindow: 128_000,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: true,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
    reasoning: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockReasoningEffortOptions>

const VOXTRAL_MINI = {
  name: 'Voxtral Mini 3B',
  id: 'mistral.voxtral-mini-3b-2507',
  contextWindow: 32_768,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: false,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const VOXTRAL_SMALL = {
  name: 'Voxtral Small 24B',
  id: 'mistral.voxtral-small-24b-2507',
  contextWindow: 32_768,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: false,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const TITAN_TEXT_LARGE = {
  name: 'Titan Text Large',
  id: 'amazon.titan-tg1-large',
  contextWindow: 8_000,
  maxOutputTokens: 8_000,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: false,
    documentChat: true,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const TITAN_TEXT_EXPRESS = {
  name: 'Titan Text Express',
  id: 'amazon.titan-text-express-v1',
  contextWindow: 8_000,
  maxOutputTokens: 8_000,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: false,
    documentChat: true,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const TITAN_TEXT_LITE = {
  name: 'Titan Text Lite',
  id: 'amazon.titan-text-lite-v1',
  contextWindow: 4_000,
  maxOutputTokens: 4_000,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: false,
    documentChat: true,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const COHERE_COMMAND_TEXT = {
  name: 'Command Text',
  id: 'cohere.command-text-v14',
  contextWindow: 4_096,
  maxOutputTokens: 4_096,
  supports: {
    converse: false,
    streaming: false,
    systemPrompts: false,
    documentChat: true,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const COHERE_COMMAND_LIGHT = {
  name: 'Command Light',
  id: 'cohere.command-light-text-v14',
  contextWindow: 4_096,
  maxOutputTokens: 4_096,
  supports: {
    converse: false,
    streaming: false,
    systemPrompts: false,
    documentChat: false,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const COHERE_COMMAND_R = {
  name: 'Command R',
  id: 'cohere.command-r-v1:0',
  contextWindow: 128_000,
  maxOutputTokens: 4_096,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: false,
    toolUse: true,
    streamingToolUse: true,
    guardrails: false,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const COHERE_COMMAND_R_PLUS = {
  name: 'Command R+',
  id: 'cohere.command-r-plus-v1:0',
  contextWindow: 128_000,
  maxOutputTokens: 4_096,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: false,
    toolUse: true,
    streamingToolUse: true,
    guardrails: false,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const DEEPSEEK_R1 = {
  name: 'DeepSeek R1',
  id: 'deepseek.r1-v1:0',
  contextWindow: 64_000,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
    reasoning: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockReasoningEffortOptions>

const DEEPSEEK_V3 = {
  name: 'DeepSeek V3',
  id: 'deepseek.v3-v1:0',
  contextWindow: 64_000,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const AI21_JAMBA_LARGE = {
  name: 'Jamba 1.5 Large',
  id: 'ai21.jamba-1-5-large-v1:0',
  contextWindow: 256_000,
  maxOutputTokens: 4_096,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: false,
    toolUse: true,
    streamingToolUse: true,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const AI21_JAMBA_MINI = {
  name: 'Jamba 1.5 Mini',
  id: 'ai21.jamba-1-5-mini-v1:0',
  contextWindow: 256_000,
  maxOutputTokens: 4_096,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: false,
    toolUse: true,
    streamingToolUse: true,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const WRITER_PALMYRA_X4 = {
  name: 'Palmyra X4',
  id: 'writer.palmyra-x4-v1:0',
  contextWindow: 128_000,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: false,
    toolUse: true,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const WRITER_PALMYRA_X5 = {
  name: 'Palmyra X5',
  id: 'writer.palmyra-x5-v1:0',
  contextWindow: 128_000,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: true,
    vision: false,
    toolUse: true,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const GEMMA_3_4B = {
  name: 'Gemma 3 4B IT',
  id: 'google.gemma-3-4b-it',
  contextWindow: 32_768,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: false,
    vision: true,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const GEMMA_3_12B = {
  name: 'Gemma 3 12B IT',
  id: 'google.gemma-3-12b-it',
  contextWindow: 32_768,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: false,
    vision: true,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const GEMMA_3_27B = {
  name: 'Gemma 3 27B IT',
  id: 'google.gemma-3-27b-it',
  contextWindow: 32_768,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: false,
    vision: true,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const NVIDIA_NEMOTRON_9B = {
  name: 'NVIDIA Nemotron Nano 9B v2',
  id: 'nvidia.nemotron-nano-9b-v2',
  contextWindow: 32_768,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: false,
    vision: false,
    toolUse: true,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
    reasoning: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockReasoningEffortOptions>

const NVIDIA_NEMOTRON_12B_VL = {
  name: 'NVIDIA Nemotron Nano 12B v2 VL',
  id: 'nvidia.nemotron-nano-12b-v2',
  contextWindow: 32_768,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: false,
    vision: true,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MINIMAX_M2 = {
  name: 'MiniMax M2',
  id: 'minimax.minimax-m2',
  contextWindow: 128_000,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: false,
    vision: false,
    toolUse: true,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MOONSHOT_KIMI_K2 = {
  name: 'Kimi K2 Thinking',
  id: 'moonshot.kimi-k2-thinking',
  contextWindow: 128_000,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: false,
    vision: false,
    toolUse: true,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
    reasoning: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockReasoningEffortOptions>

const OPENAI_SAFEGUARD_20B = {
  name: 'GPT OSS Safeguard 20B',
  id: 'openai.gpt-oss-safeguard-20b',
  contextWindow: 128_000,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: false,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const OPENAI_SAFEGUARD_120B = {
  name: 'GPT OSS Safeguard 120B',
  id: 'openai.gpt-oss-safeguard-120b',
  contextWindow: 128_000,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: false,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const QWEN_3_NEXT_80B = {
  name: 'Qwen3 Next 80B A3B Instruct',
  id: 'qwen.qwen3-next-80b-a3b',
  contextWindow: 128_000,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: false,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const QWEN_3_VL_235B = {
  name: 'Qwen3 VL 235B A22B',
  id: 'qwen.qwen3-vl-235b-a22b',
  contextWindow: 128_000,
  maxOutputTokens: 8_192,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: false,
    vision: true,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const TWELVELABS_PEGASUS = {
  name: 'Pegasus v1.2',
  id: 'twelvelabs.pegasus-v1.2:0',
  contextWindow: 128_000,
  supports: {
    converse: true,
    streaming: true,
    systemPrompts: true,
    documentChat: false,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: true,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LUMA_RAY_V2 = {
  name: 'Ray v2',
  id: 'luma.ray-v2:0',
  supports: {
    converse: false,
    streaming: false,
    systemPrompts: false,
    documentChat: false,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: false,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const TITAN_EMBED_TEXT_V1 = {
  name: 'Titan Embeddings G1 - Text',
  id: 'amazon.titan-embed-text-v1',
  contextWindow: 8_192,
  supports: {
    converse: false,
    streaming: false,
    systemPrompts: false,
    documentChat: false,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: false,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const TITAN_EMBED_TEXT_V2 = {
  name: 'Titan Text Embeddings V2',
  id: 'amazon.titan-embed-text-v2:0',
  contextWindow: 8_192,
  supports: {
    converse: false,
    streaming: false,
    systemPrompts: false,
    documentChat: false,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: false,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const TITAN_EMBED_IMAGE = {
  name: 'Titan Multimodal Embeddings G1',
  id: 'amazon.titan-embed-image-v1',
  contextWindow: 256,
  supports: {
    converse: false,
    streaming: false,
    systemPrompts: false,
    documentChat: false,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: false,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const NOVA_MULTIMODAL_EMBED = {
  name: 'Nova 2 Multimodal Embeddings',
  id: 'amazon.nova-2-multimodal-embeddings-v1:0',
  supports: {
    converse: false,
    streaming: false,
    systemPrompts: false,
    documentChat: false,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: false,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const COHERE_EMBED_ENGLISH = {
  name: 'Cohere Embed English v3',
  id: 'cohere.embed-english-v3',
  contextWindow: 512,
  supports: {
    converse: false,
    streaming: false,
    systemPrompts: false,
    documentChat: false,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: false,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const COHERE_EMBED_MULTILINGUAL = {
  name: 'Cohere Embed Multilingual v3',
  id: 'cohere.embed-multilingual-v3',
  contextWindow: 512,
  supports: {
    converse: false,
    streaming: false,
    systemPrompts: false,
    documentChat: false,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: false,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const COHERE_EMBED_V4 = {
  name: 'Cohere Embed v4',
  id: 'cohere.embed-v4:0',
  contextWindow: 128_000,
  supports: {
    converse: false,
    streaming: false,
    systemPrompts: false,
    documentChat: false,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: false,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const TWELVELABS_MARENGO_EMBED = {
  name: 'Marengo Embed v2.7',
  id: 'twelvelabs.marengo-embed-2-7-v1:0',
  supports: {
    converse: false,
    streaming: false,
    systemPrompts: false,
    documentChat: false,
    vision: false,
    toolUse: false,
    streamingToolUse: false,
    guardrails: false,
    s3Links: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

export const BEDROCK_MODELS = [
  NOVA_LITE.id,
  NOVA_MICRO.id,
  NOVA_PRO.id,
  US_NOVA_PREMIER.id,
  US_NOVA_2_LITE.id,
  US_NOVA_2_SONIC.id,
  CLAUDE_3_HAIKU.id,
  CLAUDE_3_SONNET.id,
  CLAUDE_3_OPUS.id,
  CLAUDE_3_5_HAIKU.id,
  CLAUDE_3_5_SONNET.id,
  CLAUDE_3_5_SONNET_V2.id,
  CLAUDE_3_7_SONNET.id,
  CLAUDE_HAIKU_4_5.id,
  CLAUDE_SONNET_4.id,
  CLAUDE_SONNET_4_5.id,
  CLAUDE_OPUS_4.id,
  CLAUDE_OPUS_4_1.id,
  LLAMA_3_8B.id,
  LLAMA_3_70B.id,
  LLAMA_3_1_8B.id,
  LLAMA_3_1_70B.id,
  LLAMA_3_1_405B.id,
  LLAMA_3_2_1B.id,
  LLAMA_3_2_3B.id,
  LLAMA_3_2_11B.id,
  LLAMA_3_2_90B.id,
  LLAMA_3_3_70B.id,
  LLAMA_4_SCOUT.id,
  LLAMA_4_MAVERICK.id,
  MISTRAL_7B.id,
  MIXTRAL_8X7B.id,
  MISTRAL_LARGE_2402.id,
  MISTRAL_LARGE_2407.id,
  MISTRAL_SMALL_2402.id,
  US_PIXTRAL_LARGE.id,
  TITAN_TEXT_LARGE.id,
  TITAN_TEXT_EXPRESS.id,
  TITAN_TEXT_LITE.id,
  COHERE_COMMAND_TEXT.id,
  COHERE_COMMAND_LIGHT.id,
  COHERE_COMMAND_R.id,
  COHERE_COMMAND_R_PLUS.id,
  DEEPSEEK_R1.id,
  DEEPSEEK_V3.id,
  AI21_JAMBA_LARGE.id,
  AI21_JAMBA_MINI.id,
  WRITER_PALMYRA_X4.id,
  WRITER_PALMYRA_X5.id,
  TWELVELABS_PEGASUS.id,
  LUMA_RAY_V2.id,
  MISTRAL_LARGE_3.id,
  MINISTRAL_3_3B.id,
  MINISTRAL_3_8B.id,
  MINISTRAL_3_14B.id,
  MAGISTRAL_SMALL.id,
  VOXTRAL_MINI.id,
  VOXTRAL_SMALL.id,
  GEMMA_3_4B.id,
  GEMMA_3_12B.id,
  GEMMA_3_27B.id,
  NVIDIA_NEMOTRON_9B.id,
  NVIDIA_NEMOTRON_12B_VL.id,
  MINIMAX_M2.id,
  MOONSHOT_KIMI_K2.id,
  OPENAI_SAFEGUARD_20B.id,
  OPENAI_SAFEGUARD_120B.id,
  QWEN_3_NEXT_80B.id,
  QWEN_3_VL_235B.id,
] as const

export const BEDROCK_EMBEDDING_MODELS = [
  TITAN_EMBED_TEXT_V1.id,
  TITAN_EMBED_TEXT_V2.id,
  TITAN_EMBED_IMAGE.id,
  NOVA_MULTIMODAL_EMBED.id,
  COHERE_EMBED_ENGLISH.id,
  COHERE_EMBED_MULTILINGUAL.id,
  COHERE_EMBED_V4.id,
  TWELVELABS_MARENGO_EMBED.id,
] as const

/**
 * Type-only map from Bedrock model name to its provider-specific options.
 * Options vary by model capabilities (reasoning, Anthropic-specific features).
 */
export type BedrockChatModelProviderOptionsByName = {
  [NOVA_LITE.id]: BedrockProviderOptions
  [NOVA_MICRO.id]: BedrockProviderOptions
  [NOVA_PRO.id]: BedrockProviderOptions
  [US_NOVA_PREMIER.id]: BedrockProviderOptions & BedrockReasoningEffortOptions
  [US_NOVA_2_LITE.id]: BedrockProviderOptions & BedrockReasoningEffortOptions
  [US_NOVA_2_SONIC.id]: BedrockProviderOptions
  [CLAUDE_3_HAIKU.id]: BedrockProviderOptions & BedrockAnthropicOptions
  [CLAUDE_3_SONNET.id]: BedrockProviderOptions & BedrockAnthropicOptions
  [CLAUDE_3_OPUS.id]: BedrockProviderOptions & BedrockAnthropicOptions
  [CLAUDE_3_5_HAIKU.id]: BedrockProviderOptions & BedrockAnthropicOptions
  [CLAUDE_3_5_SONNET.id]: BedrockProviderOptions & BedrockAnthropicOptions
  [CLAUDE_3_5_SONNET_V2.id]: BedrockProviderOptions & BedrockAnthropicOptions
  [CLAUDE_3_7_SONNET.id]: BedrockProviderOptions &
    BedrockAnthropicOptions &
    BedrockAnthropicReasoningOptions
  [CLAUDE_HAIKU_4_5.id]: BedrockProviderOptions &
    BedrockAnthropicOptions &
    BedrockAnthropicReasoningOptions
  [CLAUDE_SONNET_4.id]: BedrockProviderOptions &
    BedrockAnthropicOptions &
    BedrockAnthropicReasoningOptions
  [CLAUDE_SONNET_4_5.id]: BedrockProviderOptions &
    BedrockAnthropicOptions &
    BedrockAnthropicReasoningOptions
  [CLAUDE_OPUS_4.id]: BedrockProviderOptions &
    BedrockAnthropicOptions &
    BedrockAnthropicReasoningOptions
  [CLAUDE_OPUS_4_1.id]: BedrockProviderOptions &
    BedrockAnthropicOptions &
    BedrockAnthropicReasoningOptions
  [LLAMA_3_8B.id]: BedrockProviderOptions
  [LLAMA_3_70B.id]: BedrockProviderOptions
  [LLAMA_3_1_8B.id]: BedrockProviderOptions
  [LLAMA_3_1_70B.id]: BedrockProviderOptions
  [LLAMA_3_1_405B.id]: BedrockProviderOptions
  [LLAMA_3_2_1B.id]: BedrockProviderOptions
  [LLAMA_3_2_3B.id]: BedrockProviderOptions
  [LLAMA_3_2_11B.id]: BedrockProviderOptions
  [LLAMA_3_2_90B.id]: BedrockProviderOptions
  [LLAMA_3_3_70B.id]: BedrockProviderOptions
  [LLAMA_4_SCOUT.id]: BedrockProviderOptions
  [LLAMA_4_MAVERICK.id]: BedrockProviderOptions
  [MISTRAL_7B.id]: BedrockProviderOptions
  [MIXTRAL_8X7B.id]: BedrockProviderOptions
  [MISTRAL_LARGE_2402.id]: BedrockProviderOptions
  [MISTRAL_LARGE_2407.id]: BedrockProviderOptions
  [MISTRAL_SMALL_2402.id]: BedrockProviderOptions
  [US_PIXTRAL_LARGE.id]: BedrockProviderOptions
  [TITAN_TEXT_LARGE.id]: BedrockProviderOptions
  [TITAN_TEXT_EXPRESS.id]: BedrockProviderOptions
  [TITAN_TEXT_LITE.id]: BedrockProviderOptions
  [COHERE_COMMAND_TEXT.id]: BedrockProviderOptions
  [COHERE_COMMAND_LIGHT.id]: BedrockProviderOptions
  [COHERE_COMMAND_R.id]: BedrockProviderOptions
  [COHERE_COMMAND_R_PLUS.id]: BedrockProviderOptions
  [DEEPSEEK_R1.id]: BedrockProviderOptions & BedrockReasoningEffortOptions
  [DEEPSEEK_V3.id]: BedrockProviderOptions
  [AI21_JAMBA_LARGE.id]: BedrockProviderOptions
  [AI21_JAMBA_MINI.id]: BedrockProviderOptions
  [WRITER_PALMYRA_X4.id]: BedrockProviderOptions
  [WRITER_PALMYRA_X5.id]: BedrockProviderOptions
  [TWELVELABS_PEGASUS.id]: BedrockProviderOptions
  [LUMA_RAY_V2.id]: BedrockProviderOptions
  [MISTRAL_LARGE_3.id]: BedrockProviderOptions
  [MINISTRAL_3_3B.id]: BedrockProviderOptions
  [MINISTRAL_3_8B.id]: BedrockProviderOptions
  [MINISTRAL_3_14B.id]: BedrockProviderOptions
  [MAGISTRAL_SMALL.id]: BedrockProviderOptions & BedrockReasoningEffortOptions
  [VOXTRAL_MINI.id]: BedrockProviderOptions
  [VOXTRAL_SMALL.id]: BedrockProviderOptions
  [GEMMA_3_4B.id]: BedrockProviderOptions
  [GEMMA_3_12B.id]: BedrockProviderOptions
  [GEMMA_3_27B.id]: BedrockProviderOptions
  [NVIDIA_NEMOTRON_9B.id]: BedrockProviderOptions & BedrockReasoningEffortOptions
  [NVIDIA_NEMOTRON_12B_VL.id]: BedrockProviderOptions
  [MINIMAX_M2.id]: BedrockProviderOptions
  [MOONSHOT_KIMI_K2.id]: BedrockProviderOptions & BedrockReasoningEffortOptions
  [OPENAI_SAFEGUARD_20B.id]: BedrockProviderOptions
  [OPENAI_SAFEGUARD_120B.id]: BedrockProviderOptions
  [QWEN_3_NEXT_80B.id]: BedrockProviderOptions
  [QWEN_3_VL_235B.id]: BedrockProviderOptions
}

type TextOnly = readonly ['text']
type TextImage = readonly ['text', 'image']
type TextImageDocument = readonly ['text', 'image', 'document']
type TextDocument = readonly ['text', 'document']

/**
 * Type-only map from Bedrock model name to its supported input modalities.
 * Derived from the supports.vision and supports.documentChat flags.
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html
 */
export type BedrockModelInputModalitiesByName = {
  [NOVA_LITE.id]: TextImageDocument
  [NOVA_MICRO.id]: TextOnly
  [NOVA_PRO.id]: TextImageDocument
  [US_NOVA_PREMIER.id]: TextImageDocument
  [US_NOVA_2_LITE.id]: TextImageDocument
  [US_NOVA_2_SONIC.id]: TextOnly
  [CLAUDE_3_HAIKU.id]: TextImageDocument
  [CLAUDE_3_SONNET.id]: TextImageDocument
  [CLAUDE_3_OPUS.id]: TextImageDocument
  [CLAUDE_3_5_HAIKU.id]: TextDocument
  [CLAUDE_3_5_SONNET.id]: TextImageDocument
  [CLAUDE_3_5_SONNET_V2.id]: TextImageDocument
  [CLAUDE_3_7_SONNET.id]: TextImageDocument
  [CLAUDE_HAIKU_4_5.id]: TextImageDocument
  [CLAUDE_SONNET_4.id]: TextImageDocument
  [CLAUDE_SONNET_4_5.id]: TextImageDocument
  [CLAUDE_OPUS_4.id]: TextImageDocument
  [CLAUDE_OPUS_4_1.id]: TextImageDocument
  [LLAMA_3_8B.id]: TextDocument
  [LLAMA_3_70B.id]: TextDocument
  [LLAMA_3_1_8B.id]: TextDocument
  [LLAMA_3_1_70B.id]: TextDocument
  [LLAMA_3_1_405B.id]: TextDocument
  [LLAMA_3_2_1B.id]: TextDocument
  [LLAMA_3_2_3B.id]: TextDocument
  [LLAMA_3_2_11B.id]: TextImageDocument
  [LLAMA_3_2_90B.id]: TextImageDocument
  [LLAMA_3_3_70B.id]: TextDocument
  [LLAMA_4_SCOUT.id]: TextImageDocument
  [LLAMA_4_MAVERICK.id]: TextImageDocument
  [MISTRAL_7B.id]: TextDocument
  [MIXTRAL_8X7B.id]: TextDocument
  [MISTRAL_LARGE_2402.id]: TextDocument
  [MISTRAL_LARGE_2407.id]: TextDocument
  [MISTRAL_SMALL_2402.id]: TextOnly
  [US_PIXTRAL_LARGE.id]: TextImageDocument
  [TITAN_TEXT_LARGE.id]: TextDocument
  [TITAN_TEXT_EXPRESS.id]: TextDocument
  [TITAN_TEXT_LITE.id]: TextDocument
  [COHERE_COMMAND_TEXT.id]: TextDocument
  [COHERE_COMMAND_LIGHT.id]: TextOnly
  [COHERE_COMMAND_R.id]: TextDocument
  [COHERE_COMMAND_R_PLUS.id]: TextDocument
  [DEEPSEEK_R1.id]: TextDocument
  [DEEPSEEK_V3.id]: TextDocument
  [AI21_JAMBA_LARGE.id]: TextDocument
  [AI21_JAMBA_MINI.id]: TextDocument
  [WRITER_PALMYRA_X4.id]: TextDocument
  [WRITER_PALMYRA_X5.id]: TextDocument
  [TWELVELABS_PEGASUS.id]: TextOnly
  [LUMA_RAY_V2.id]: TextOnly
  [MISTRAL_LARGE_3.id]: TextImageDocument
  [MINISTRAL_3_3B.id]: TextImageDocument
  [MINISTRAL_3_8B.id]: TextImageDocument
  [MINISTRAL_3_14B.id]: TextImageDocument
  [MAGISTRAL_SMALL.id]: TextImageDocument
  [VOXTRAL_MINI.id]: TextOnly
  [VOXTRAL_SMALL.id]: TextOnly
  [GEMMA_3_4B.id]: TextImage
  [GEMMA_3_12B.id]: TextImage
  [GEMMA_3_27B.id]: TextImage
  [NVIDIA_NEMOTRON_9B.id]: TextOnly
  [NVIDIA_NEMOTRON_12B_VL.id]: TextImage
  [MINIMAX_M2.id]: TextOnly
  [MOONSHOT_KIMI_K2.id]: TextOnly
  [OPENAI_SAFEGUARD_20B.id]: TextOnly
  [OPENAI_SAFEGUARD_120B.id]: TextOnly
  [QWEN_3_NEXT_80B.id]: TextOnly
  [QWEN_3_VL_235B.id]: TextImage
}

