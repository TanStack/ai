import { buildBaseUsage } from '@tanstack/ai'
import type { TokenUsage } from '@tanstack/ai'
import type Anthropic_SDK from '@anthropic-ai/sdk'

/**
 * Anthropic-specific provider usage details.
 * These fields are unique to Anthropic and placed in providerUsageDetails.
 */
export interface AnthropicProviderUsageDetails {
  /**
   * Server-side tool usage metrics.
   * Available when using Anthropic's built-in tools like web search.
   */
  serverToolUse?: {
    /** Number of web search requests made during the response */
    webSearchRequests?: number
    /** Number of web fetch requests made during the response */
    webFetchRequests?: number
  }
  /** Index signature for Record<string, unknown> compatibility */
  [key: string]: unknown
}

/**
 * Build normalized TokenUsage from Anthropic's usage object.
 * Handles cache tokens and server tool use metrics.
 */
export function buildAnthropicUsage(
  usage:
    | Anthropic_SDK.Beta.BetaUsage
    | Anthropic_SDK.Beta.BetaMessageDeltaUsage,
): TokenUsage {
  const inputTokens = usage.input_tokens ?? 0
  // `|| 0` (rather than `?? 0`) matches the sibling builders and stays defensive
  // against a runtime-absent count without tripping no-unnecessary-condition
  // (the SDK types output_tokens as a required number).
  const outputTokens = usage.output_tokens || 0

  const result = buildBaseUsage({
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    totalTokens: inputTokens + outputTokens,
  })

  // Add prompt token details for cache tokens. Only attach the details object
  // when at least one field is present so we don't emit an empty `{}` (every
  // other adapter guards with the same Object.keys check).
  const cacheCreation = usage.cache_creation_input_tokens
  const cacheRead = usage.cache_read_input_tokens

  const promptTokensDetails = {
    ...(cacheCreation ? { cacheWriteTokens: cacheCreation } : {}),
    ...(cacheRead ? { cachedTokens: cacheRead } : {}),
  }
  if (Object.keys(promptTokensDetails).length > 0) {
    result.promptTokensDetails = promptTokensDetails
  }

  // Add provider-specific usage details for server tool use, again only when
  // the provider actually reported any server tool requests.
  const serverToolUse = usage.server_tool_use
  const serverToolUseDetails = {
    ...(serverToolUse?.web_search_requests
      ? { webSearchRequests: serverToolUse.web_search_requests }
      : {}),
    ...(serverToolUse?.web_fetch_requests
      ? { webFetchRequests: serverToolUse.web_fetch_requests }
      : {}),
  }
  if (Object.keys(serverToolUseDetails).length > 0) {
    result.providerUsageDetails = {
      serverToolUse: serverToolUseDetails,
    } satisfies AnthropicProviderUsageDetails
  }

  return result
}
