
/**
 * Metadata describing a Bedrock chat model's capabilities.
 */
export interface BedrockModelMeta {
    /** Human-readable short name for the model. */
    name: string
    /** Full Bedrock model ID used in API requests. */
    id: string
    /** Supported capabilities for this model. */
    supports: {
        /** Input modalities the model accepts. */
        input: Array<'text' | 'image' | 'audio' | 'video' | 'document'>
        /** Whether the model supports extended thinking / reasoning. */
        thinking?: boolean
    }
    /** Maximum number of tokens in the context window. */
    context_window?: number
    /** Maximum number of output tokens the model can generate. */
    max_output_tokens?: number
}

// ===========================
// Amazon Nova Models (Latest)
// ===========================

/** Amazon Nova Pro v1 — multimodal model with 300K context. */
export const BEDROCK_AMAZON_NOVA_PRO_V1 = {
    name: 'nova-pro-v1',
    id: 'amazon.nova-pro-v1:0',
    context_window: 300_000,
    max_output_tokens: 5120,
    supports: {
        input: ['text', 'image', 'video', 'document'],
    },
} as const satisfies BedrockModelMeta

/** Amazon Nova Lite v1 — cost-effective multimodal model with 300K context. */
export const BEDROCK_AMAZON_NOVA_LITE_V1 = {
    name: 'nova-lite-v1',
    id: 'amazon.nova-lite-v1:0',
    context_window: 300_000,
    max_output_tokens: 5120,
    supports: {
        input: ['text', 'image', 'video', 'document'],
    },
} as const satisfies BedrockModelMeta

/** Amazon Nova Micro v1 — text-only model with 128K context, lowest latency. */
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

/** Anthropic Claude Sonnet 4.5 via Bedrock — 1M context, thinking support. */
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

/** Anthropic Claude Haiku 4.5 via Bedrock — 200K context, fast and cost-effective, thinking support. */
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

/** All supported Bedrock chat model IDs. */
export const BEDROCK_CHAT_MODELS = [
    BEDROCK_AMAZON_NOVA_PRO_V1.id,
    BEDROCK_AMAZON_NOVA_LITE_V1.id,
    BEDROCK_AMAZON_NOVA_MICRO_V1.id,
    BEDROCK_ANTHROPIC_CLAUDE_SONNET_4_5.id,
    BEDROCK_ANTHROPIC_CLAUDE_HAIKU_4_5.id,
] as const

/**
 * Union of known Bedrock model IDs plus an open `string` escape hatch for
 * models not yet listed in this package.
 */
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

/** Returns `true` if the model ID refers to an Anthropic Claude model on Bedrock. */
export const isClaude = (model: string) => model.includes('anthropic.claude')
/** Returns `true` if the model ID refers to an Amazon Nova model on Bedrock. */
export const isNova = (model: string) => model.includes('amazon.nova')
