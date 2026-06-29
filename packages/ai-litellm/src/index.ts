/**
 * @module @tanstack/ai-litellm
 *
 * LiteLLM AI gateway adapter for TanStack AI.
 * Provides a tree-shakeable adapter for LiteLLM's OpenAI-compatible proxy,
 * giving access to 100+ LLM providers through a single interface.
 */

// Text (Chat) adapter
export {
  LiteLLMTextAdapter,
  createLitellmText,
  litellmText,
  type LiteLLMTextConfig,
} from './adapters/text'

// Utilities
export {
  getLiteLLMApiKeyFromEnv,
  withLiteLLMDefaults,
  type LiteLLMClientConfig,
} from './utils'
