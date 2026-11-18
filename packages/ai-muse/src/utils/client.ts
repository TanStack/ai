import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { createOpenAIClient } from '@tanstack/openai-base'

/**
 * The options `createOpenAIClient` accepts. Derived from the base factory so
 * the config type matches the exact `openai` copy the base resolves, rather
 * than a second copy pulled in by a direct `openai` dependency.
 */
type OpenAIClientOptions = Parameters<typeof createOpenAIClient>[0]

export interface MuseClientConfig extends Omit<OpenAIClientOptions, 'apiKey'> {
  apiKey: string
}

/**
 * Gets the Muse API key from environment variables.
 *
 * `MUSE_API_KEY` is the provider-scoped name, matching the repo's other
 * adapters (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, …). Meta's own docs call
 * the same key `MODEL_API_KEY`, so that name is accepted as a fallback.
 *
 * @throws Error if neither variable is found
 */
export function getMuseApiKeyFromEnv(): string {
  try {
    return getApiKeyFromEnv('MUSE_API_KEY')
  } catch {
    try {
      return getApiKeyFromEnv('MODEL_API_KEY')
    } catch {
      throw new Error(
        'MUSE_API_KEY is required. Please set it in your environment variables or use the factory function with an explicit API key.',
      )
    }
  }
}

/**
 * Returns a Muse client config with the Meta Model API base URL applied
 * when not already set. Meta serves Muse through an OpenAI-compatible
 * endpoint at api.meta.ai, so the adapter drives it with the OpenAI SDK
 * pointed at this base URL.
 */
export function withMuseDefaults(config: MuseClientConfig): MuseClientConfig {
  return {
    ...config,
    baseURL: config.baseURL || 'https://api.meta.ai/v1',
  }
}
