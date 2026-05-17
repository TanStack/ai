import OpenAI from 'openai'
import { getPerplexityApiKeyFromEnv } from '../utils/api-key'
import type { ClientOptions } from 'openai'

export interface PerplexityChatClientConfig extends ClientOptions {
  /** Perplexity API key. Falls back to `PERPLEXITY_API_KEY` / `PPLX_API_KEY` env vars. */
  apiKey?: string
  /** Override the API base URL (defaults to https://api.perplexity.ai). */
  baseURL?: string
}

const DEFAULT_BASE_URL = 'https://api.perplexity.ai'

/**
 * Create an OpenAI SDK client pointed at Perplexity's OpenAI-compatible
 * chat-completions endpoint.
 *
 * Perplexity exposes `POST /v1/chat/completions` with the standard OpenAI
 * Chat Completions request/response shape, so any code that consumes the
 * `openai` SDK can target Perplexity by swapping the `baseURL`.
 *
 * @example
 * ```ts
 * import { createPerplexityChatClient } from '@tanstack/ai-perplexity/chat'
 *
 * const client = createPerplexityChatClient()
 * const completion = await client.chat.completions.create({
 *   model: 'sonar',
 *   messages: [{ role: 'user', content: 'What is the latest on the Mars rover?' }],
 * })
 * ```
 */
export function createPerplexityChatClient(
  config: PerplexityChatClientConfig = {},
): OpenAI {
  const { apiKey, baseURL, ...rest } = config
  const resolvedApiKey =
    typeof apiKey === 'string' && apiKey.trim().length > 0
      ? apiKey
      : getPerplexityApiKeyFromEnv()

  return new OpenAI({
    ...rest,
    apiKey: resolvedApiKey,
    baseURL: baseURL ?? DEFAULT_BASE_URL,
  })
}
