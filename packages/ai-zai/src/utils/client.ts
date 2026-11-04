import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { ClientOptions } from 'openai'

export const ZAI_GENERAL_BASE_URL = 'https://api.z.ai/api/paas/v4'
export const ZAI_CODING_BASE_URL = 'https://api.z.ai/api/coding/paas/v4'

export interface ZAIClientConfig extends Omit<ClientOptions, 'apiKey'> {
  apiKey: string
  /**
   * Use Z.AI's coding-plan endpoint instead of the general one. Ignored when
   * `baseURL` is set.
   */
  coding?: boolean
}

export function getZAIHeaders(): Record<string, string> {
  return {
    'Accept-Language': 'en-US,en',
  }
}

/**
 * Gets the Z.AI API key from `ZAI_API_KEY`.
 * @throws Error if the variable is not set
 */
export function getZAIApiKeyFromEnv(): string {
  try {
    return getApiKeyFromEnv('ZAI_API_KEY')
  } catch {
    throw new Error(
      'ZAI_API_KEY is required. Please set it in your environment variables or use the factory function with an explicit API key.',
    )
  }
}

/**
 * Validates the Z.AI API key format.
 * Checks for empty strings, whitespace, and invalid prefixes.
 */
export function validateZAIApiKey(apiKey?: string): string {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('Z.AI API key is required')
  }

  const trimmed = apiKey.trim()

  if (!trimmed) {
    throw new Error('Z.AI API key is required')
  }

  if (/^bearer\s+/i.test(trimmed)) {
    throw new Error(
      'Z.AI API key must be the raw token (do not include the "Bearer " prefix)',
    )
  }

  if (/\s/.test(trimmed)) {
    throw new Error('Z.AI API key must not contain whitespace')
  }

  return trimmed
}

/**
 * Returns a client config with the Z.AI base URL and default headers applied
 * when not already set. The Z.AI endpoint accepts the OpenAI SDK verbatim, so
 * the adapter drives it via the OpenAI SDK with this baseURL.
 */
export function withZaiDefaults(config: ZAIClientConfig): ZAIClientConfig {
  return {
    ...config,
    apiKey: validateZAIApiKey(config.apiKey),
    baseURL:
      config.baseURL ??
      (config.coding ? ZAI_CODING_BASE_URL : ZAI_GENERAL_BASE_URL),
    defaultHeaders: {
      ...getZAIHeaders(),
      ...config.defaultHeaders,
    },
  }
}
