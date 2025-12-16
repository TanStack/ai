import type {
  ClaudeAgentSdkProviderOptions,
} from './text/text-provider-options'

/**
 * Model metadata interface for Claude models.
 */
interface ModelMeta {
  name: string
  id: string
  supports: {
    input: readonly ['text', 'image', 'document']
    extended_thinking: boolean
  }
  context_window: number
  max_output_tokens: number
  knowledge_cutoff?: string
  pricing: {
    input: {
      normal: number
    }
    output: {
      normal: number
    }
  }
}

/**
 * Claude Agent SDK uses short model names: 'haiku', 'sonnet', 'opus'
 * These map to the latest available version of each model tier.
 */
const CLAUDE_HAIKU = {
  name: 'Claude Haiku',
  id: 'haiku',
  context_window: 200_000,
  max_output_tokens: 64_000,
  knowledge_cutoff: '2025-01',
  pricing: {
    input: { normal: 1 },
    output: { normal: 5 },
  },
  supports: {
    input: ['text', 'image', 'document'] as const,
    extended_thinking: true,
  },
} as const satisfies ModelMeta

const CLAUDE_SONNET = {
  name: 'Claude Sonnet',
  id: 'sonnet',
  context_window: 200_000,
  max_output_tokens: 64_000,
  knowledge_cutoff: '2025-01',
  pricing: {
    input: { normal: 3 },
    output: { normal: 15 },
  },
  supports: {
    input: ['text', 'image', 'document'] as const,
    extended_thinking: true,
  },
} as const satisfies ModelMeta

const CLAUDE_OPUS = {
  name: 'Claude Opus',
  id: 'opus',
  context_window: 200_000,
  max_output_tokens: 64_000, // Opus 4.5 supports 64K output tokens
  knowledge_cutoff: '2025-01',
  pricing: {
    input: { normal: 15 },
    output: { normal: 75 },
  },
  supports: {
    input: ['text', 'image', 'document'] as const,
    extended_thinking: true,
  },
} as const satisfies ModelMeta

/**
 * Array of supported Claude model IDs for the Claude Agent SDK adapter.
 * The SDK uses short model names: 'haiku', 'sonnet', 'opus'
 */
export const CLAUDE_AGENT_SDK_MODELS = [
  CLAUDE_HAIKU.id,
  CLAUDE_SONNET.id,
  CLAUDE_OPUS.id,
] as const

/**
 * Type representing supported Claude model names.
 */
export type ClaudeAgentSdkModel = (typeof CLAUDE_AGENT_SDK_MODELS)[number]

/**
 * Type-only map from chat model name to its provider options.
 * All Claude models via Agent SDK support the same set of options.
 */
export type ClaudeAgentSdkChatModelProviderOptionsByName = {
  [CLAUDE_HAIKU.id]: ClaudeAgentSdkProviderOptions
  [CLAUDE_SONNET.id]: ClaudeAgentSdkProviderOptions
  [CLAUDE_OPUS.id]: ClaudeAgentSdkProviderOptions
}

/**
 * Type-only map from chat model name to its supported input modalities.
 * All Claude models support text, image, and document (PDF) input.
 */
export type ClaudeAgentSdkModelInputModalitiesByName = {
  [CLAUDE_HAIKU.id]: typeof CLAUDE_HAIKU.supports.input
  [CLAUDE_SONNET.id]: typeof CLAUDE_SONNET.supports.input
  [CLAUDE_OPUS.id]: typeof CLAUDE_OPUS.supports.input
}
