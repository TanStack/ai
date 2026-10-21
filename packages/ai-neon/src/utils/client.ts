import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import { normalizeNeonContent } from './normalize-content'
import type { ClientOptions } from 'openai'

/**
 * The gateway routes on the branch host. Chat Completions serves every chat
 * model, Responses serves the OpenAI models, and Anthropic serves Claude. The
 * Anthropic SDK appends `/v1/messages` itself.
 */
export const NEON_ROUTES = {
  chat: '/v1', // also serves embeddings
  responses: '/openai/v1',
  anthropic: '/anthropic',
} as const

export interface NeonClientConfig extends Omit<
  ClientOptions,
  'apiKey' | 'baseURL'
> {
  /** The Neon credential (`nt_live_...`), sent as `Authorization: Bearer`. */
  apiKey: string
  /**
   * The bare branch gateway host, with no path, for example
   * `https://<branch>-api.ai.<cell>.<region>.aws.neon.tech`. The adapter
   * appends each route's path. Defaults to `NEON_AI_GATEWAY_BASE_URL`.
   */
  baseURL?: string
}

/**
 * Gets the Neon credential from `NEON_AI_GATEWAY_TOKEN`.
 * @throws Error if it is not set
 */
export function getNeonTokenFromEnv(): string {
  try {
    return getApiKeyFromEnv('NEON_AI_GATEWAY_TOKEN')
  } catch (cause) {
    throw new Error(
      'NEON_AI_GATEWAY_TOKEN is required. Set it in the environment (`neon env pull` writes it) or pass the token to a create* factory.',
      { cause },
    )
  }
}

/**
 * The branch gateway host: `baseURL`, else `NEON_AI_GATEWAY_BASE_URL`, with
 * any trailing slash removed.
 * @throws Error if neither is set
 */
export function resolveNeonHost(baseURL?: string): string {
  let host = baseURL
  if (!host) {
    try {
      host = getApiKeyFromEnv('NEON_AI_GATEWAY_BASE_URL')
    } catch (cause) {
      throw new Error(
        'NEON_AI_GATEWAY_BASE_URL is required. Set it in the environment (`neon env pull` writes it) or pass baseURL.',
        { cause },
      )
    }
  }
  return host.replace(/\/+$/, '')
}

/** OpenAI client options for one route of the gateway. */
export function withNeonDefaults(
  config: NeonClientConfig,
  route: 'chat' | 'responses',
): ClientOptions {
  const { baseURL, fetch, ...rest } = config
  return {
    ...rest,
    baseURL: resolveNeonHost(baseURL) + NEON_ROUTES[route],
    // Only Chat Completions returns the array `content` that needs fixing.
    fetch: route === 'chat' ? normalizeNeonContent(fetch) : fetch,
  }
}
