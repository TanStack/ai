import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { ClientOptions } from 'openai'

export interface OrcaRouterClientConfig extends Omit<ClientOptions, 'apiKey'> {
  apiKey: string
}

/**
 * Gets the OrcaRouter API key from environment variables.
 * @throws Error if ORCAROUTER_API_KEY is not found
 */
export function getOrcaRouterApiKeyFromEnv(): string {
  try {
    return getApiKeyFromEnv('ORCAROUTER_API_KEY')
  } catch {
    throw new Error(
      'ORCAROUTER_API_KEY is required. Please set it in your environment variables or use the factory function with an explicit API key.',
    )
  }
}

/**
 * Returns an OrcaRouter client config with OrcaRouter's OpenAI-compatible
 * base URL applied when not already set. OrcaRouter exposes the OpenAI Chat
 * Completions wire format verbatim, so the adapter drives it with the OpenAI
 * SDK and this baseURL — the same pattern as the Groq and Grok adapters.
 */
export function withOrcaRouterDefaults(
  config: OrcaRouterClientConfig,
): OrcaRouterClientConfig {
  return {
    ...config,
    baseURL: config.baseURL || 'https://api.orcarouter.ai/v1',
  }
}
