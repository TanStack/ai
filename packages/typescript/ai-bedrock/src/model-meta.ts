/**
 * Bedrock model metadata and provider options
 *
 * ## Inference Profiles (Cross-Region Inference)
 *
 * AWS Bedrock uses "inference profiles" to enable cross-region model invocation.
 * For newer Claude models (Claude 3.5 Sonnet v2, Claude 3.7 Sonnet, Claude 4 series),
 * **inference profiles are required** - direct model IDs will return an error:
 *
 * ```
 * "Invocation of model ID anthropic.claude-3-5-sonnet-20241022-v2:0 with on-demand
 * throughput isn't supported. Retry your request with the ID or ARN of an inference
 * profile that contains this model."
 * ```
 *
 * ### Model ID Formats
 *
 * | Format | Example | Use Case |
 * |--------|---------|----------|
 * | Direct | `anthropic.claude-3-haiku-20240307-v1:0` | Legacy models in single region |
 * | US Profile | `us.anthropic.claude-3-5-sonnet-20241022-v2:0` | **Recommended** - US cross-region |
 * | EU Profile | `eu.anthropic.claude-3-5-sonnet-20241022-v2:0` | EU cross-region (GDPR compliance) |
 *
 * ### Utilities
 *
 * Use the exported helper functions:
 * - `toInferenceProfileId(modelId, region?)` - Convert to inference profile
 * - `isInferenceProfileId(modelId)` - Check if already an inference profile
 * - `isAnthropicModel(modelId)` - Check if Anthropic model (any format)
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

interface ModelMeta<TProviderOptions = unknown> {
  name: string
  id: string
  supports: {
    input: Array<'text' | 'image' | 'audio' | 'video' | 'document'>
    output: Array<'text' | 'image' | 'audio' | 'video' | 'embedding'>
    reasoning?: boolean
    tools?: boolean
    streaming?: boolean
  }
  context_window?: number
  max_output_tokens?: number
  providerOptions?: TProviderOptions
}

const NOVA_LITE = {
  name: 'Nova Lite',
  id: 'amazon.nova-lite-v1:0',
  context_window: 300_000,
  max_output_tokens: 5_000,
  supports: {
    input: ['text', 'image', 'video'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const NOVA_MICRO = {
  name: 'Nova Micro',
  id: 'amazon.nova-micro-v1:0',
  context_window: 128_000,
  max_output_tokens: 5_000,
  supports: {
    input: ['text'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const NOVA_PRO = {
  name: 'Nova Pro',
  id: 'amazon.nova-pro-v1:0',
  context_window: 300_000,
  max_output_tokens: 5_000,
  supports: {
    input: ['text', 'image', 'video', 'document'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const US_NOVA_PREMIER = {
  name: 'Nova Premier',
  id: 'us.amazon.nova-premier-v1:0',
  context_window: 1_000_000,
  max_output_tokens: 32_000,
  supports: {
    input: ['text', 'image', 'video', 'document'],
    output: ['text'],
    reasoning: true,
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockReasoningEffortOptions>

const US_NOVA_PRO = {
  name: 'Nova Pro (US)',
  id: 'us.amazon.nova-pro-v1:0',
  context_window: 300_000,
  max_output_tokens: 5_000,
  supports: {
    input: ['text', 'image', 'video', 'document'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const US_NOVA_MICRO = {
  name: 'Nova Micro (US)',
  id: 'us.amazon.nova-micro-v1:0',
  context_window: 128_000,
  max_output_tokens: 5_000,
  supports: {
    input: ['text'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const US_NOVA_LITE = {
  name: 'Nova Lite (US)',
  id: 'us.amazon.nova-lite-v1:0',
  context_window: 300_000,
  max_output_tokens: 5_000,
  supports: {
    input: ['text', 'image', 'video'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const US_NOVA_2_LITE = {
  name: 'Nova 2 Lite',
  id: 'us.amazon.nova-2-lite-v1:0',
  context_window: 1_000_000,
  max_output_tokens: 32_000,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    reasoning: true,
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockReasoningEffortOptions>

const US_NOVA_2_SONIC = {
  name: 'Nova 2 Sonic',
  id: 'us.amazon.nova-2-sonic-v1:0',
  context_window: 1_000_000,
  supports: {
    input: ['audio', 'text'],
    output: ['audio', 'text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const CLAUDE_3_HAIKU = {
  name: 'Claude 3 Haiku',
  id: 'anthropic.claude-3-haiku-20240307-v1:0',
  context_window: 200_000,
  max_output_tokens: 4_096,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockAnthropicOptions>

const CLAUDE_3_SONNET = {
  name: 'Claude 3 Sonnet',
  id: 'anthropic.claude-3-sonnet-20240229-v1:0',
  context_window: 200_000,
  max_output_tokens: 4_096,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockAnthropicOptions>

const CLAUDE_3_OPUS = {
  name: 'Claude 3 Opus',
  id: 'anthropic.claude-3-opus-20240229-v1:0',
  context_window: 200_000,
  max_output_tokens: 4_096,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockAnthropicOptions>

const CLAUDE_3_5_HAIKU = {
  name: 'Claude 3.5 Haiku',
  id: 'anthropic.claude-3-5-haiku-20241022-v1:0',
  context_window: 200_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockAnthropicOptions>

const CLAUDE_3_5_SONNET = {
  name: 'Claude 3.5 Sonnet',
  id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
  context_window: 200_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockAnthropicOptions>

const CLAUDE_3_5_SONNET_V2 = {
  name: 'Claude 3.5 Sonnet v2',
  id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
  context_window: 200_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockAnthropicOptions>

const CLAUDE_3_7_SONNET = {
  name: 'Claude 3.7 Sonnet',
  id: 'anthropic.claude-3-7-sonnet-20250219-v1:0',
  context_window: 200_000,
  max_output_tokens: 64_000,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    reasoning: true,
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<
  BedrockProviderOptions & BedrockAnthropicOptions & BedrockAnthropicReasoningOptions
>

const CLAUDE_HAIKU_4_5 = {
  name: 'Claude Haiku 4.5',
  id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
  context_window: 200_000,
  max_output_tokens: 64_000,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    reasoning: true,
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<
  BedrockProviderOptions & BedrockAnthropicOptions & BedrockAnthropicReasoningOptions
>

const CLAUDE_SONNET_4 = {
  name: 'Claude Sonnet 4',
  id: 'anthropic.claude-sonnet-4-20250514-v1:0',
  context_window: 200_000,
  max_output_tokens: 64_000,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    reasoning: true,
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<
  BedrockProviderOptions & BedrockAnthropicOptions & BedrockAnthropicReasoningOptions
>

const CLAUDE_SONNET_4_5 = {
  name: 'Claude Sonnet 4.5',
  id: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
  context_window: 200_000,
  max_output_tokens: 64_000,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    reasoning: true,
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<
  BedrockProviderOptions & BedrockAnthropicOptions & BedrockAnthropicReasoningOptions
>

const CLAUDE_OPUS_4 = {
  name: 'Claude Opus 4',
  id: 'anthropic.claude-opus-4-20250514-v1:0',
  context_window: 200_000,
  max_output_tokens: 32_000,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    reasoning: true,
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<
  BedrockProviderOptions & BedrockAnthropicOptions & BedrockAnthropicReasoningOptions
>

const CLAUDE_OPUS_4_1 = {
  name: 'Claude Opus 4.1',
  id: 'anthropic.claude-opus-4-1-20250805-v1:0',
  context_window: 200_000,
  max_output_tokens: 64_000,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    reasoning: true,
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<
  BedrockProviderOptions & BedrockAnthropicOptions & BedrockAnthropicReasoningOptions
>

const US_CLAUDE_3_HAIKU = {
  name: 'Claude 3 Haiku (US)',
  id: 'us.anthropic.claude-3-haiku-20240307-v1:0',
  context_window: 200_000,
  max_output_tokens: 4_096,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockAnthropicOptions>

const US_CLAUDE_3_SONNET = {
  name: 'Claude 3 Sonnet (US)',
  id: 'us.anthropic.claude-3-sonnet-20240229-v1:0',
  context_window: 200_000,
  max_output_tokens: 4_096,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockAnthropicOptions>

const US_CLAUDE_3_OPUS = {
  name: 'Claude 3 Opus (US)',
  id: 'us.anthropic.claude-3-opus-20240229-v1:0',
  context_window: 200_000,
  max_output_tokens: 4_096,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockAnthropicOptions>

const US_CLAUDE_3_5_HAIKU = {
  name: 'Claude 3.5 Haiku (US)',
  id: 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
  context_window: 200_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockAnthropicOptions>

const US_CLAUDE_3_5_SONNET = {
  name: 'Claude 3.5 Sonnet (US)',
  id: 'us.anthropic.claude-3-5-sonnet-20240620-v1:0',
  context_window: 200_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockAnthropicOptions>

const US_CLAUDE_3_5_SONNET_V2 = {
  name: 'Claude 3.5 Sonnet v2 (US)',
  id: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
  context_window: 200_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockAnthropicOptions>

const US_CLAUDE_3_7_SONNET = {
  name: 'Claude 3.7 Sonnet (US)',
  id: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
  context_window: 200_000,
  max_output_tokens: 64_000,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    reasoning: true,
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<
  BedrockProviderOptions & BedrockAnthropicOptions & BedrockAnthropicReasoningOptions
>

const US_CLAUDE_SONNET_4 = {
  name: 'Claude Sonnet 4 (US)',
  id: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  context_window: 200_000,
  max_output_tokens: 64_000,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    reasoning: true,
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<
  BedrockProviderOptions & BedrockAnthropicOptions & BedrockAnthropicReasoningOptions
>

const US_CLAUDE_SONNET_4_5 = {
  name: 'Claude Sonnet 4.5 (US)',
  id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  context_window: 200_000,
  max_output_tokens: 64_000,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    reasoning: true,
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<
  BedrockProviderOptions & BedrockAnthropicOptions & BedrockAnthropicReasoningOptions
>

const US_CLAUDE_OPUS_4 = {
  name: 'Claude Opus 4 (US)',
  id: 'us.anthropic.claude-opus-4-20250514-v1:0',
  context_window: 200_000,
  max_output_tokens: 32_000,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    reasoning: true,
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<
  BedrockProviderOptions & BedrockAnthropicOptions & BedrockAnthropicReasoningOptions
>

const US_CLAUDE_OPUS_4_1 = {
  name: 'Claude Opus 4.1 (US)',
  id: 'us.anthropic.claude-opus-4-1-20250805-v1:0',
  context_window: 200_000,
  max_output_tokens: 64_000,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    reasoning: true,
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<
  BedrockProviderOptions & BedrockAnthropicOptions & BedrockAnthropicReasoningOptions
>

const LLAMA_3_8B = {
  name: 'Llama 3 8B Instruct',
  id: 'meta.llama3-8b-instruct-v1:0',
  context_window: 8_192,
  max_output_tokens: 2_048,
  supports: {
    input: ['text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LLAMA_3_70B = {
  name: 'Llama 3 70B Instruct',
  id: 'meta.llama3-70b-instruct-v1:0',
  context_window: 8_192,
  max_output_tokens: 2_048,
  supports: {
    input: ['text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LLAMA_3_1_8B = {
  name: 'Llama 3.1 8B Instruct',
  id: 'meta.llama3-1-8b-instruct-v1:0',
  context_window: 128_000,
  max_output_tokens: 2_048,
  supports: {
    input: ['text'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LLAMA_3_1_70B = {
  name: 'Llama 3.1 70B Instruct',
  id: 'meta.llama3-1-70b-instruct-v1:0',
  context_window: 128_000,
  max_output_tokens: 2_048,
  supports: {
    input: ['text'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LLAMA_3_1_405B = {
  name: 'Llama 3.1 405B Instruct',
  id: 'meta.llama3-1-405b-instruct-v1:0',
  context_window: 128_000,
  max_output_tokens: 2_048,
  supports: {
    input: ['text'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LLAMA_3_2_1B = {
  name: 'Llama 3.2 1B Instruct',
  id: 'meta.llama3-2-1b-instruct-v1:0',
  context_window: 128_000,
  max_output_tokens: 2_048,
  supports: {
    input: ['text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LLAMA_3_2_3B = {
  name: 'Llama 3.2 3B Instruct',
  id: 'meta.llama3-2-3b-instruct-v1:0',
  context_window: 128_000,
  max_output_tokens: 2_048,
  supports: {
    input: ['text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LLAMA_3_2_11B = {
  name: 'Llama 3.2 11B Vision Instruct',
  id: 'meta.llama3-2-11b-instruct-v1:0',
  context_window: 128_000,
  max_output_tokens: 2_048,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LLAMA_3_2_90B = {
  name: 'Llama 3.2 90B Vision Instruct',
  id: 'meta.llama3-2-90b-instruct-v1:0',
  context_window: 128_000,
  max_output_tokens: 2_048,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LLAMA_3_3_70B = {
  name: 'Llama 3.3 70B Instruct',
  id: 'meta.llama3-3-70b-instruct-v1:0',
  context_window: 128_000,
  max_output_tokens: 2_048,
  supports: {
    input: ['text'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LLAMA_4_SCOUT = {
  name: 'Llama 4 Scout 17B Instruct',
  id: 'meta.llama4-scout-17b-instruct-v1:0',
  context_window: 3_500_000,
  max_output_tokens: 16_384,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LLAMA_4_MAVERICK = {
  name: 'Llama 4 Maverick 17B Instruct',
  id: 'meta.llama4-maverick-17b-instruct-v1:0',
  context_window: 1_000_000,
  max_output_tokens: 16_384,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const US_LLAMA_3_1_8B = {
  name: 'Llama 3.1 8B Instruct (US)',
  id: 'us.meta.llama3-1-8b-instruct-v1:0',
  context_window: 128_000,
  max_output_tokens: 2_048,
  supports: {
    input: ['text'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const US_LLAMA_3_1_70B = {
  name: 'Llama 3.1 70B Instruct (US)',
  id: 'us.meta.llama3-1-70b-instruct-v1:0',
  context_window: 128_000,
  max_output_tokens: 2_048,
  supports: {
    input: ['text'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const US_LLAMA_3_2_1B = {
  name: 'Llama 3.2 1B Instruct (US)',
  id: 'us.meta.llama3-2-1b-instruct-v1:0',
  context_window: 128_000,
  max_output_tokens: 2_048,
  supports: {
    input: ['text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const US_LLAMA_3_2_3B = {
  name: 'Llama 3.2 3B Instruct (US)',
  id: 'us.meta.llama3-2-3b-instruct-v1:0',
  context_window: 128_000,
  max_output_tokens: 2_048,
  supports: {
    input: ['text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const US_LLAMA_3_2_11B = {
  name: 'Llama 3.2 11B Vision Instruct (US)',
  id: 'us.meta.llama3-2-11b-instruct-v1:0',
  context_window: 128_000,
  max_output_tokens: 2_048,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const US_LLAMA_3_2_90B = {
  name: 'Llama 3.2 90B Vision Instruct (US)',
  id: 'us.meta.llama3-2-90b-instruct-v1:0',
  context_window: 128_000,
  max_output_tokens: 2_048,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const US_LLAMA_3_3_70B = {
  name: 'Llama 3.3 70B Instruct (US)',
  id: 'us.meta.llama3-3-70b-instruct-v1:0',
  context_window: 128_000,
  max_output_tokens: 2_048,
  supports: {
    input: ['text'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const US_LLAMA_4_SCOUT = {
  name: 'Llama 4 Scout 17B Instruct (US)',
  id: 'us.meta.llama4-scout-17b-instruct-v1:0',
  context_window: 3_500_000,
  max_output_tokens: 16_384,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const US_LLAMA_4_MAVERICK = {
  name: 'Llama 4 Maverick 17B Instruct (US)',
  id: 'us.meta.llama4-maverick-17b-instruct-v1:0',
  context_window: 1_000_000,
  max_output_tokens: 16_384,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MISTRAL_7B = {
  name: 'Mistral 7B Instruct',
  id: 'mistral.mistral-7b-instruct-v0:2',
  context_window: 32_768,
  max_output_tokens: 8_192,
  supports: {
    input: ['text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MIXTRAL_8X7B = {
  name: 'Mixtral 8x7B Instruct',
  id: 'mistral.mixtral-8x7b-instruct-v0:1',
  context_window: 32_768,
  max_output_tokens: 4_096,
  supports: {
    input: ['text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MISTRAL_LARGE_2402 = {
  name: 'Mistral Large (24.02)',
  id: 'mistral.mistral-large-2402-v1:0',
  context_window: 32_768,
  max_output_tokens: 8_192,
  supports: {
    input: ['text'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MISTRAL_LARGE_2407 = {
  name: 'Mistral Large (24.07)',
  id: 'mistral.mistral-large-2407-v1:0',
  context_window: 128_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MISTRAL_SMALL_2402 = {
  name: 'Mistral Small (24.02)',
  id: 'mistral.mistral-small-2402-v1:0',
  context_window: 32_768,
  max_output_tokens: 8_192,
  supports: {
    input: ['text'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const US_PIXTRAL_LARGE = {
  name: 'Pixtral Large (25.02)',
  id: 'us.mistral.pixtral-large-2502-v1:0',
  context_window: 128_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MISTRAL_LARGE_3 = {
  name: 'Mistral Large 3',
  id: 'mistral.mistral-large-3-675b-instruct',
  context_window: 128_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MINISTRAL_3_3B = {
  name: 'Ministral 3 3B',
  id: 'mistral.ministral-3-3b-instruct',
  context_window: 128_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MINISTRAL_3_8B = {
  name: 'Ministral 3 8B',
  id: 'mistral.ministral-3-8b-instruct',
  context_window: 128_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MINISTRAL_3_14B = {
  name: 'Ministral 3 14B',
  id: 'mistral.ministral-3-14b-instruct',
  context_window: 128_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MAGISTRAL_SMALL = {
  name: 'Magistral Small',
  id: 'mistral.magistral-small-2509',
  context_window: 128_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    reasoning: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockReasoningEffortOptions>

const VOXTRAL_MINI = {
  name: 'Voxtral Mini 3B',
  id: 'mistral.voxtral-mini-3b-2507',
  context_window: 32_768,
  supports: {
    input: ['audio', 'text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const VOXTRAL_SMALL = {
  name: 'Voxtral Small 24B',
  id: 'mistral.voxtral-small-24b-2507',
  context_window: 32_768,
  supports: {
    input: ['audio', 'text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const TITAN_TEXT_LARGE = {
  name: 'Titan Text Large',
  id: 'amazon.titan-tg1-large',
  context_window: 8_000,
  max_output_tokens: 8_000,
  supports: {
    input: ['text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const TITAN_TEXT_EXPRESS = {
  name: 'Titan Text Express',
  id: 'amazon.titan-text-express-v1',
  context_window: 8_000,
  max_output_tokens: 8_000,
  supports: {
    input: ['text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const TITAN_TEXT_LITE = {
  name: 'Titan Text Lite',
  id: 'amazon.titan-text-lite-v1',
  context_window: 4_000,
  max_output_tokens: 4_000,
  supports: {
    input: ['text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const COHERE_COMMAND_TEXT = {
  name: 'Command Text',
  id: 'cohere.command-text-v14',
  context_window: 4_096,
  max_output_tokens: 4_096,
  supports: {
    input: ['text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const COHERE_COMMAND_LIGHT = {
  name: 'Command Light',
  id: 'cohere.command-light-text-v14',
  context_window: 4_096,
  max_output_tokens: 4_096,
  supports: {
    input: ['text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const COHERE_COMMAND_R = {
  name: 'Command R',
  id: 'cohere.command-r-v1:0',
  context_window: 128_000,
  max_output_tokens: 4_096,
  supports: {
    input: ['text'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const COHERE_COMMAND_R_PLUS = {
  name: 'Command R+',
  id: 'cohere.command-r-plus-v1:0',
  context_window: 128_000,
  max_output_tokens: 4_096,
  supports: {
    input: ['text'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const DEEPSEEK_R1 = {
  name: 'DeepSeek R1',
  id: 'deepseek.r1-v1:0',
  context_window: 64_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text'],
    output: ['text'],
    reasoning: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockReasoningEffortOptions>

const US_DEEPSEEK_R1 = {
  name: 'DeepSeek R1 (US)',
  id: 'us.deepseek.r1-v1:0',
  context_window: 64_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text'],
    output: ['text'],
    reasoning: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockReasoningEffortOptions>

const DEEPSEEK_V3 = {
  name: 'DeepSeek V3',
  id: 'deepseek.v3-v1:0',
  context_window: 64_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const AI21_JAMBA_LARGE = {
  name: 'Jamba 1.5 Large',
  id: 'ai21.jamba-1-5-large-v1:0',
  context_window: 256_000,
  max_output_tokens: 4_096,
  supports: {
    input: ['text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const AI21_JAMBA_MINI = {
  name: 'Jamba 1.5 Mini',
  id: 'ai21.jamba-1-5-mini-v1:0',
  context_window: 256_000,
  max_output_tokens: 4_096,
  supports: {
    input: ['text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const WRITER_PALMYRA_X4 = {
  name: 'Palmyra X4',
  id: 'writer.palmyra-x4-v1:0',
  context_window: 128_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const WRITER_PALMYRA_X5 = {
  name: 'Palmyra X5',
  id: 'writer.palmyra-x5-v1:0',
  context_window: 128_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const GEMMA_3_4B = {
  name: 'Gemma 3 4B IT',
  id: 'google.gemma-3-4b-it',
  context_window: 32_768,
  max_output_tokens: 8_192,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const GEMMA_3_12B = {
  name: 'Gemma 3 12B IT',
  id: 'google.gemma-3-12b-it',
  context_window: 32_768,
  max_output_tokens: 8_192,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const GEMMA_3_27B = {
  name: 'Gemma 3 27B IT',
  id: 'google.gemma-3-27b-it',
  context_window: 32_768,
  max_output_tokens: 8_192,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const NVIDIA_NEMOTRON_9B = {
  name: 'NVIDIA Nemotron Nano 9B v2',
  id: 'nvidia.nemotron-nano-9b-v2',
  context_window: 32_768,
  max_output_tokens: 8_192,
  supports: {
    input: ['text'],
    output: ['text'],
    reasoning: true,
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockReasoningEffortOptions>

const NVIDIA_NEMOTRON_12B_VL = {
  name: 'NVIDIA Nemotron Nano 12B v2 VL',
  id: 'nvidia.nemotron-nano-12b-v2',
  context_window: 32_768,
  max_output_tokens: 8_192,
  supports: {
    input: ['text', 'image', 'video'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MINIMAX_M2 = {
  name: 'MiniMax M2',
  id: 'minimax.minimax-m2',
  context_window: 128_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text'],
    output: ['text'],
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const MOONSHOT_KIMI_K2 = {
  name: 'Kimi K2 Thinking',
  id: 'moonshot.kimi-k2-thinking',
  context_window: 128_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text'],
    output: ['text'],
    reasoning: true,
    tools: true,
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions & BedrockReasoningEffortOptions>

const OPENAI_SAFEGUARD_20B = {
  name: 'GPT OSS Safeguard 20B',
  id: 'openai.gpt-oss-safeguard-20b',
  context_window: 128_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const OPENAI_SAFEGUARD_120B = {
  name: 'GPT OSS Safeguard 120B',
  id: 'openai.gpt-oss-safeguard-120b',
  context_window: 128_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const QWEN_3_NEXT_80B = {
  name: 'Qwen3 Next 80B A3B Instruct',
  id: 'qwen.qwen3-next-80b-a3b',
  context_window: 128_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const QWEN_3_VL_235B = {
  name: 'Qwen3 VL 235B A22B',
  id: 'qwen.qwen3-vl-235b-a22b',
  context_window: 128_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const TWELVELABS_PEGASUS = {
  name: 'Pegasus v1.2',
  id: 'twelvelabs.pegasus-v1.2:0',
  context_window: 128_000,
  supports: {
    input: ['text', 'video'],
    output: ['text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const LUMA_RAY_V2 = {
  name: 'Ray v2',
  id: 'luma.ray-v2:0',
  supports: {
    input: ['text'],
    output: ['video'],
    streaming: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const TITAN_EMBED_TEXT_V1 = {
  name: 'Titan Embeddings G1 - Text',
  id: 'amazon.titan-embed-text-v1',
  context_window: 8_192,
  supports: {
    input: ['text'],
    output: ['embedding'],
    streaming: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const TITAN_EMBED_TEXT_V2 = {
  name: 'Titan Text Embeddings V2',
  id: 'amazon.titan-embed-text-v2:0',
  context_window: 8_192,
  supports: {
    input: ['text'],
    output: ['embedding'],
    streaming: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const TITAN_EMBED_IMAGE = {
  name: 'Titan Multimodal Embeddings G1',
  id: 'amazon.titan-embed-image-v1',
  context_window: 256,
  supports: {
    input: ['text', 'image'],
    output: ['embedding'],
    streaming: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const NOVA_MULTIMODAL_EMBED = {
  name: 'Nova 2 Multimodal Embeddings',
  id: 'amazon.nova-2-multimodal-embeddings-v1:0',
  supports: {
    input: ['text', 'image', 'audio', 'video'],
    output: ['embedding'],
    streaming: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const COHERE_EMBED_ENGLISH = {
  name: 'Cohere Embed English v3',
  id: 'cohere.embed-english-v3',
  context_window: 512,
  supports: {
    input: ['text'],
    output: ['embedding'],
    streaming: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const COHERE_EMBED_MULTILINGUAL = {
  name: 'Cohere Embed Multilingual v3',
  id: 'cohere.embed-multilingual-v3',
  context_window: 512,
  supports: {
    input: ['text'],
    output: ['embedding'],
    streaming: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const COHERE_EMBED_V4 = {
  name: 'Cohere Embed v4',
  id: 'cohere.embed-v4:0',
  context_window: 128_000,
  supports: {
    input: ['text', 'image'],
    output: ['embedding'],
    streaming: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const TWELVELABS_MARENGO_EMBED = {
  name: 'Marengo Embed v2.7',
  id: 'twelvelabs.marengo-embed-2-7-v1:0',
  supports: {
    input: ['video'],
    output: ['embedding'],
    streaming: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

/* const NOVA_CANVAS = {
  name: 'Nova Canvas',
  id: 'amazon.nova-canvas-v1:0',
  supports: {
    input: ['text', 'image'],
    output: ['image'],
    streaming: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const NOVA_REEL_V1_0 = {
  name: 'Nova Reel',
  id: 'amazon.nova-reel-v1:0',
  supports: {
    input: ['text', 'image'],
    output: ['video'],
    streaming: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const NOVA_REEL_V1_1 = {
  name: 'Nova Reel',
  id: 'amazon.nova-reel-v1:1',
  supports: {
    input: ['text', 'image'],
    output: ['video'],
    streaming: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const NOVA_SONIC = {
  name: 'Nova Sonic',
  id: 'amazon.nova-sonic-v1:0',
  context_window: 300_000,
  supports: {
    input: ['audio'],
    output: ['audio', 'text'],
    streaming: true,
  },
} as const satisfies ModelMeta<BedrockProviderOptions>

const RERANK_1_0 = {
  name: 'Rerank 1.0',
  id: 'amazon.rerank-v1:0',
  supports: {
    input: ['text'],
    output: ['text'],
    streaming: false,
  },
} as const satisfies ModelMeta<BedrockProviderOptions> */

export const BEDROCK_MODELS = [
  NOVA_LITE.id,
  NOVA_MICRO.id,
  NOVA_PRO.id,
  US_NOVA_PREMIER.id,
  US_NOVA_PRO.id,
  US_NOVA_MICRO.id,
  US_NOVA_LITE.id,
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
  US_CLAUDE_3_HAIKU.id,
  US_CLAUDE_3_SONNET.id,
  US_CLAUDE_3_OPUS.id,
  US_CLAUDE_3_5_HAIKU.id,
  US_CLAUDE_3_5_SONNET.id,
  US_CLAUDE_3_5_SONNET_V2.id,
  US_CLAUDE_3_7_SONNET.id,
  US_CLAUDE_SONNET_4.id,
  US_CLAUDE_SONNET_4_5.id,
  US_CLAUDE_OPUS_4.id,
  US_CLAUDE_OPUS_4_1.id,
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
  US_LLAMA_3_1_8B.id,
  US_LLAMA_3_1_70B.id,
  US_LLAMA_3_2_1B.id,
  US_LLAMA_3_2_3B.id,
  US_LLAMA_3_2_11B.id,
  US_LLAMA_3_2_90B.id,
  US_LLAMA_3_3_70B.id,
  US_LLAMA_4_SCOUT.id,
  US_LLAMA_4_MAVERICK.id,
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
  US_DEEPSEEK_R1.id,
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

/* const BEDROCK_IMAGE_MODELS = [
  NOVA_CANVAS.id,
] as const */

/* const BEDROCK_VIDEO_MODELS = [
  NOVA_REEL_V1_0.id,
  NOVA_REEL_V1_1.id,
] as const */

/* const BEDROCK_RERANK_MODELS = [
  RERANK_1_0.id,
] as const */

/* const BEDROCK_SPEECH_MODELS = [
  NOVA_SONIC.id,
] as const */

/**
 * Type-only map from Bedrock model name to its provider-specific options.
 * Options vary by model capabilities (reasoning, Anthropic-specific features).
 */
export type BedrockChatModelProviderOptionsByName = {
  [NOVA_LITE.id]: BedrockProviderOptions
  [NOVA_MICRO.id]: BedrockProviderOptions
  [NOVA_PRO.id]: BedrockProviderOptions
  [US_NOVA_PREMIER.id]: BedrockProviderOptions & BedrockReasoningEffortOptions
  [US_NOVA_PRO.id]: BedrockProviderOptions
  [US_NOVA_MICRO.id]: BedrockProviderOptions
  [US_NOVA_LITE.id]: BedrockProviderOptions
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
  [US_CLAUDE_3_HAIKU.id]: BedrockProviderOptions & BedrockAnthropicOptions
  [US_CLAUDE_3_SONNET.id]: BedrockProviderOptions & BedrockAnthropicOptions
  [US_CLAUDE_3_OPUS.id]: BedrockProviderOptions & BedrockAnthropicOptions
  [US_CLAUDE_3_5_HAIKU.id]: BedrockProviderOptions & BedrockAnthropicOptions
  [US_CLAUDE_3_5_SONNET.id]: BedrockProviderOptions & BedrockAnthropicOptions
  [US_CLAUDE_3_5_SONNET_V2.id]: BedrockProviderOptions & BedrockAnthropicOptions
  [US_CLAUDE_3_7_SONNET.id]: BedrockProviderOptions &
    BedrockAnthropicOptions &
    BedrockAnthropicReasoningOptions
  [US_CLAUDE_SONNET_4.id]: BedrockProviderOptions &
    BedrockAnthropicOptions &
    BedrockAnthropicReasoningOptions
  [US_CLAUDE_SONNET_4_5.id]: BedrockProviderOptions &
    BedrockAnthropicOptions &
    BedrockAnthropicReasoningOptions
  [US_CLAUDE_OPUS_4.id]: BedrockProviderOptions &
    BedrockAnthropicOptions &
    BedrockAnthropicReasoningOptions
  [US_CLAUDE_OPUS_4_1.id]: BedrockProviderOptions &
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
  [US_LLAMA_3_1_8B.id]: BedrockProviderOptions
  [US_LLAMA_3_1_70B.id]: BedrockProviderOptions
  [US_LLAMA_3_2_1B.id]: BedrockProviderOptions
  [US_LLAMA_3_2_3B.id]: BedrockProviderOptions
  [US_LLAMA_3_2_11B.id]: BedrockProviderOptions
  [US_LLAMA_3_2_90B.id]: BedrockProviderOptions
  [US_LLAMA_3_3_70B.id]: BedrockProviderOptions
  [US_LLAMA_4_SCOUT.id]: BedrockProviderOptions
  [US_LLAMA_4_MAVERICK.id]: BedrockProviderOptions
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
  [US_DEEPSEEK_R1.id]: BedrockProviderOptions & BedrockReasoningEffortOptions
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

/**
 * Type-only map from Bedrock model name to its supported input modalities.
 * Used by the core AI types to constrain ContentPart types based on the selected model.
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html
 */
export type BedrockModelInputModalitiesByName = {
  [NOVA_LITE.id]: typeof NOVA_LITE.supports.input
  [NOVA_MICRO.id]: typeof NOVA_MICRO.supports.input
  [NOVA_PRO.id]: typeof NOVA_PRO.supports.input
  [US_NOVA_PREMIER.id]: typeof US_NOVA_PREMIER.supports.input
  [US_NOVA_PRO.id]: typeof US_NOVA_PRO.supports.input
  [US_NOVA_MICRO.id]: typeof US_NOVA_MICRO.supports.input
  [US_NOVA_LITE.id]: typeof US_NOVA_LITE.supports.input
  [US_NOVA_2_LITE.id]: typeof US_NOVA_2_LITE.supports.input
  [US_NOVA_2_SONIC.id]: typeof US_NOVA_2_SONIC.supports.input
  [CLAUDE_3_HAIKU.id]: typeof CLAUDE_3_HAIKU.supports.input
  [CLAUDE_3_SONNET.id]: typeof CLAUDE_3_SONNET.supports.input
  [CLAUDE_3_OPUS.id]: typeof CLAUDE_3_OPUS.supports.input
  [CLAUDE_3_5_HAIKU.id]: typeof CLAUDE_3_5_HAIKU.supports.input
  [CLAUDE_3_5_SONNET.id]: typeof CLAUDE_3_5_SONNET.supports.input
  [CLAUDE_3_5_SONNET_V2.id]: typeof CLAUDE_3_5_SONNET_V2.supports.input
  [CLAUDE_3_7_SONNET.id]: typeof CLAUDE_3_7_SONNET.supports.input
  [CLAUDE_HAIKU_4_5.id]: typeof CLAUDE_HAIKU_4_5.supports.input
  [CLAUDE_SONNET_4.id]: typeof CLAUDE_SONNET_4.supports.input
  [CLAUDE_SONNET_4_5.id]: typeof CLAUDE_SONNET_4_5.supports.input
  [CLAUDE_OPUS_4.id]: typeof CLAUDE_OPUS_4.supports.input
  [CLAUDE_OPUS_4_1.id]: typeof CLAUDE_OPUS_4_1.supports.input
  [US_CLAUDE_3_HAIKU.id]: typeof US_CLAUDE_3_HAIKU.supports.input
  [US_CLAUDE_3_SONNET.id]: typeof US_CLAUDE_3_SONNET.supports.input
  [US_CLAUDE_3_OPUS.id]: typeof US_CLAUDE_3_OPUS.supports.input
  [US_CLAUDE_3_5_HAIKU.id]: typeof US_CLAUDE_3_5_HAIKU.supports.input
  [US_CLAUDE_3_5_SONNET.id]: typeof US_CLAUDE_3_5_SONNET.supports.input
  [US_CLAUDE_3_5_SONNET_V2.id]: typeof US_CLAUDE_3_5_SONNET_V2.supports.input
  [US_CLAUDE_3_7_SONNET.id]: typeof US_CLAUDE_3_7_SONNET.supports.input
  [US_CLAUDE_SONNET_4.id]: typeof US_CLAUDE_SONNET_4.supports.input
  [US_CLAUDE_SONNET_4_5.id]: typeof US_CLAUDE_SONNET_4_5.supports.input
  [US_CLAUDE_OPUS_4.id]: typeof US_CLAUDE_OPUS_4.supports.input
  [US_CLAUDE_OPUS_4_1.id]: typeof US_CLAUDE_OPUS_4_1.supports.input
  [LLAMA_3_8B.id]: typeof LLAMA_3_8B.supports.input
  [LLAMA_3_70B.id]: typeof LLAMA_3_70B.supports.input
  [LLAMA_3_1_8B.id]: typeof LLAMA_3_1_8B.supports.input
  [LLAMA_3_1_70B.id]: typeof LLAMA_3_1_70B.supports.input
  [LLAMA_3_1_405B.id]: typeof LLAMA_3_1_405B.supports.input
  [LLAMA_3_2_1B.id]: typeof LLAMA_3_2_1B.supports.input
  [LLAMA_3_2_3B.id]: typeof LLAMA_3_2_3B.supports.input
  [LLAMA_3_2_11B.id]: typeof LLAMA_3_2_11B.supports.input
  [LLAMA_3_2_90B.id]: typeof LLAMA_3_2_90B.supports.input
  [LLAMA_3_3_70B.id]: typeof LLAMA_3_3_70B.supports.input
  [LLAMA_4_SCOUT.id]: typeof LLAMA_4_SCOUT.supports.input
  [LLAMA_4_MAVERICK.id]: typeof LLAMA_4_MAVERICK.supports.input
  [US_LLAMA_3_1_8B.id]: typeof US_LLAMA_3_1_8B.supports.input
  [US_LLAMA_3_1_70B.id]: typeof US_LLAMA_3_1_70B.supports.input
  [US_LLAMA_3_2_1B.id]: typeof US_LLAMA_3_2_1B.supports.input
  [US_LLAMA_3_2_3B.id]: typeof US_LLAMA_3_2_3B.supports.input
  [US_LLAMA_3_2_11B.id]: typeof US_LLAMA_3_2_11B.supports.input
  [US_LLAMA_3_2_90B.id]: typeof US_LLAMA_3_2_90B.supports.input
  [US_LLAMA_3_3_70B.id]: typeof US_LLAMA_3_3_70B.supports.input
  [US_LLAMA_4_SCOUT.id]: typeof US_LLAMA_4_SCOUT.supports.input
  [US_LLAMA_4_MAVERICK.id]: typeof US_LLAMA_4_MAVERICK.supports.input
  [MISTRAL_7B.id]: typeof MISTRAL_7B.supports.input
  [MIXTRAL_8X7B.id]: typeof MIXTRAL_8X7B.supports.input
  [MISTRAL_LARGE_2402.id]: typeof MISTRAL_LARGE_2402.supports.input
  [MISTRAL_LARGE_2407.id]: typeof MISTRAL_LARGE_2407.supports.input
  [MISTRAL_SMALL_2402.id]: typeof MISTRAL_SMALL_2402.supports.input
  [US_PIXTRAL_LARGE.id]: typeof US_PIXTRAL_LARGE.supports.input
  [TITAN_TEXT_LARGE.id]: typeof TITAN_TEXT_LARGE.supports.input
  [TITAN_TEXT_EXPRESS.id]: typeof TITAN_TEXT_EXPRESS.supports.input
  [TITAN_TEXT_LITE.id]: typeof TITAN_TEXT_LITE.supports.input
  [COHERE_COMMAND_TEXT.id]: typeof COHERE_COMMAND_TEXT.supports.input
  [COHERE_COMMAND_LIGHT.id]: typeof COHERE_COMMAND_LIGHT.supports.input
  [COHERE_COMMAND_R.id]: typeof COHERE_COMMAND_R.supports.input
  [COHERE_COMMAND_R_PLUS.id]: typeof COHERE_COMMAND_R_PLUS.supports.input
  [DEEPSEEK_R1.id]: typeof DEEPSEEK_R1.supports.input
  [US_DEEPSEEK_R1.id]: typeof US_DEEPSEEK_R1.supports.input
  [DEEPSEEK_V3.id]: typeof DEEPSEEK_V3.supports.input
  [AI21_JAMBA_LARGE.id]: typeof AI21_JAMBA_LARGE.supports.input
  [AI21_JAMBA_MINI.id]: typeof AI21_JAMBA_MINI.supports.input
  [WRITER_PALMYRA_X4.id]: typeof WRITER_PALMYRA_X4.supports.input
  [WRITER_PALMYRA_X5.id]: typeof WRITER_PALMYRA_X5.supports.input
  [TWELVELABS_PEGASUS.id]: typeof TWELVELABS_PEGASUS.supports.input
  [LUMA_RAY_V2.id]: typeof LUMA_RAY_V2.supports.input
  [MISTRAL_LARGE_3.id]: typeof MISTRAL_LARGE_3.supports.input
  [MINISTRAL_3_3B.id]: typeof MINISTRAL_3_3B.supports.input
  [MINISTRAL_3_8B.id]: typeof MINISTRAL_3_8B.supports.input
  [MINISTRAL_3_14B.id]: typeof MINISTRAL_3_14B.supports.input
  [MAGISTRAL_SMALL.id]: typeof MAGISTRAL_SMALL.supports.input
  [VOXTRAL_MINI.id]: typeof VOXTRAL_MINI.supports.input
  [VOXTRAL_SMALL.id]: typeof VOXTRAL_SMALL.supports.input
  [GEMMA_3_4B.id]: typeof GEMMA_3_4B.supports.input
  [GEMMA_3_12B.id]: typeof GEMMA_3_12B.supports.input
  [GEMMA_3_27B.id]: typeof GEMMA_3_27B.supports.input
  [NVIDIA_NEMOTRON_9B.id]: typeof NVIDIA_NEMOTRON_9B.supports.input
  [NVIDIA_NEMOTRON_12B_VL.id]: typeof NVIDIA_NEMOTRON_12B_VL.supports.input
  [MINIMAX_M2.id]: typeof MINIMAX_M2.supports.input
  [MOONSHOT_KIMI_K2.id]: typeof MOONSHOT_KIMI_K2.supports.input
  [OPENAI_SAFEGUARD_20B.id]: typeof OPENAI_SAFEGUARD_20B.supports.input
  [OPENAI_SAFEGUARD_120B.id]: typeof OPENAI_SAFEGUARD_120B.supports.input
  [QWEN_3_NEXT_80B.id]: typeof QWEN_3_NEXT_80B.supports.input
  [QWEN_3_VL_235B.id]: typeof QWEN_3_VL_235B.supports.input
}

/**
 * Inference Profile Region type for cross-region inference
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles.html
 */
export type InferenceProfileRegion = 'us' | 'eu'

/**
 * Converts a direct Anthropic model ID to an inference profile ID.
 *
 * AWS Bedrock requires inference profiles for newer Claude models (Claude 3.5 Sonnet v2 and later).
 * Direct model IDs like `anthropic.claude-3-5-sonnet-20241022-v2:0` will not work for on-demand
 * invocation with these models. Use this helper to convert to the appropriate inference profile.
 *
 * @param modelId - The model ID (can be direct or already an inference profile)
 * @param region - The inference profile region ('us' or 'eu'). Defaults to 'us'.
 * @returns The inference profile model ID
 *
 * @example
 * ```typescript
 * // Convert direct model ID to US inference profile
 * toInferenceProfileId('anthropic.claude-3-5-sonnet-20241022-v2:0')
 * // Returns: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0'
 *
 * // Convert to EU inference profile
 * toInferenceProfileId('anthropic.claude-3-5-sonnet-20241022-v2:0', 'eu')
 * // Returns: 'eu.anthropic.claude-3-5-sonnet-20241022-v2:0'
 *
 * // Already an inference profile - returns unchanged
 * toInferenceProfileId('us.anthropic.claude-3-5-sonnet-20241022-v2:0')
 * // Returns: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0'
 * ```
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html
 */
export function toInferenceProfileId(
  modelId: string,
  region: InferenceProfileRegion = 'us',
): string {
  if (
    modelId.startsWith('us.') ||
    modelId.startsWith('eu.') ||
    !modelId.startsWith('anthropic.')
  ) {
    return modelId
  }
  return `${region}.${modelId}`
}

/**
 * Checks if a model ID is an Anthropic model (direct or inference profile)
 *
 * @param modelId - The model ID to check
 * @returns true if the model ID is for an Anthropic model
 *
 * @example
 * ```typescript
 * isAnthropicModel('anthropic.claude-3-5-sonnet-20241022-v2:0') // true
 * isAnthropicModel('us.anthropic.claude-3-5-sonnet-20241022-v2:0') // true
 * isAnthropicModel('eu.anthropic.claude-3-haiku-20240307-v1:0') // true
 * isAnthropicModel('amazon.nova-lite-v1:0') // false
 * ```
 */
export function isAnthropicModel(modelId: string): boolean {
  return (
    modelId.startsWith('anthropic.') ||
    modelId.startsWith('us.anthropic.') ||
    modelId.startsWith('eu.anthropic.')
  )
}

/**
 * Checks if a model ID uses an inference profile format
 *
 * @param modelId - The model ID to check
 * @returns true if the model ID uses an inference profile (has us. or eu. prefix)
 *
 * @example
 * ```typescript
 * isInferenceProfileId('us.anthropic.claude-3-5-sonnet-20241022-v2:0') // true
 * isInferenceProfileId('eu.anthropic.claude-3-haiku-20240307-v1:0') // true
 * isInferenceProfileId('anthropic.claude-3-5-sonnet-20241022-v2:0') // false
 * isInferenceProfileId('us.amazon.nova-premier-v1:0') // true
 * ```
 */
export function isInferenceProfileId(modelId: string): boolean {
  return modelId.startsWith('us.') || modelId.startsWith('eu.')
}
