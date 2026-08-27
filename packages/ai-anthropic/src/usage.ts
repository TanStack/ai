import { buildBaseUsage } from '@tanstack/ai'
import type { TokenUsage } from '@tanstack/ai'
import type Anthropic_SDK from '@anthropic-ai/sdk'

export type AnthropicProviderUsageDetails = {
  serverToolUse?: {
    /** Number of web search requests made during the response */
    webSearchRequests?: number
    /** Number of web fetch requests made during the response */
    webFetchRequests?: number
  }
}

export function buildAnthropicUsage(
  usage:
    | Anthropic_SDK.Beta.BetaUsage
    | Anthropic_SDK.Beta.BetaMessageDeltaUsage
    | undefined
    | null,
): TokenUsage<AnthropicProviderUsageDetails> | undefined {
  if (!usage) return undefined

  const inputTokens = usage.input_tokens ?? 0
  const outputTokens = usage.output_tokens || 0

  const result = buildBaseUsage<AnthropicProviderUsageDetails>({
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    totalTokens: inputTokens + outputTokens,
  })

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
