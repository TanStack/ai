
export interface BedrockModelMeta {
    name: string
    id: string
    supports: {
        input: Array<'text' | 'image' | 'audio' | 'video' | 'document'>
        thinking?: boolean
    }
    context_window?: number
    max_output_tokens?: number
}

// ===========================
// Amazon Nova Models (Latest)
// ===========================

export const BEDROCK_AMAZON_NOVA_PRO_V1 = {
    name: 'nova-pro-v1',
    id: 'amazon.nova-pro-v1:0',
    context_window: 300_000,
    max_output_tokens: 5120,
    supports: {
        input: ['text', 'image', 'video', 'document'],
    },
} as const satisfies BedrockModelMeta

export const BEDROCK_AMAZON_NOVA_LITE_V1 = {
    name: 'nova-lite-v1',
    id: 'amazon.nova-lite-v1:0',
    context_window: 300_000,
    max_output_tokens: 5120,
    supports: {
        input: ['text', 'image', 'video', 'document'],
    },
} as const satisfies BedrockModelMeta

export const BEDROCK_AMAZON_NOVA_MICRO_V1 = {
    name: 'nova-micro-v1',
    id: 'amazon.nova-micro-v1:0',
    context_window: 128_000,
    max_output_tokens: 5120,
    supports: {
        input: ['text'],
    },
} as const satisfies BedrockModelMeta

// ===========================
// Flagship Anthropic Models (V4)
// ===========================

export const BEDROCK_ANTHROPIC_CLAUDE_SONNET_4_5 = {
    name: 'claude-4-5-sonnet',
    id: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
    context_window: 1_000_000,
    max_output_tokens: 64_000,
    supports: {
        input: ['text', 'image', 'document'],
        thinking: true,
    },
} as const satisfies BedrockModelMeta

export const BEDROCK_ANTHROPIC_CLAUDE_HAIKU_4_5 = {
    name: 'claude-4-5-haiku',
    id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
    context_window: 200_000,
    max_output_tokens: 64_000,
    supports: {
        input: ['text', 'image', 'document'],
        thinking: true,
    },
} as const satisfies BedrockModelMeta

export const BEDROCK_CHAT_MODELS = [
    BEDROCK_AMAZON_NOVA_PRO_V1.id,
    BEDROCK_AMAZON_NOVA_LITE_V1.id,
    BEDROCK_AMAZON_NOVA_MICRO_V1.id,
    BEDROCK_ANTHROPIC_CLAUDE_SONNET_4_5.id,
    BEDROCK_ANTHROPIC_CLAUDE_HAIKU_4_5.id,
] as const

export type BedrockModelId = (typeof BEDROCK_CHAT_MODELS)[number] | (string & {})

/**
 * Type-only map from chat model name to its supported input modalities.
 */
export type BedrockModelInputModalitiesByName = {
    [BEDROCK_AMAZON_NOVA_PRO_V1.id]: typeof BEDROCK_AMAZON_NOVA_PRO_V1.supports.input
    [BEDROCK_AMAZON_NOVA_LITE_V1.id]: typeof BEDROCK_AMAZON_NOVA_LITE_V1.supports.input
    [BEDROCK_AMAZON_NOVA_MICRO_V1.id]: typeof BEDROCK_AMAZON_NOVA_MICRO_V1.supports.input
    [BEDROCK_ANTHROPIC_CLAUDE_SONNET_4_5.id]: typeof BEDROCK_ANTHROPIC_CLAUDE_SONNET_4_5.supports.input
    [BEDROCK_ANTHROPIC_CLAUDE_HAIKU_4_5.id]: typeof BEDROCK_ANTHROPIC_CLAUDE_HAIKU_4_5.supports.input
}

// ===========================
// Model Detection Helpers
// ===========================

export const isClaude = (model: string) => model.includes('anthropic.claude')
export const isNova = (model: string) => model.includes('amazon.nova')
