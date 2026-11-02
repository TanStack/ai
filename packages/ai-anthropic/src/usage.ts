import { buildBaseUsage } from '@tanstack/ai'
import type { TokenUsage } from '@tanstack/ai'
import type Anthropic_SDK from '@anthropic-ai/sdk'

/**
 * Anthropic-specific provider usage details.
 * These fields are unique to Anthropic and placed in providerUsageDetails.
 */
export type AnthropicProviderUsageDetails = {
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
  /**
   * Per-iteration token usage (`usage.iterations`). A `compaction` entry's
   * tokens are not in the top-level counts.
   */
  iterations?: Array<{
    type: string
    model?: string
    inputTokens: number
    outputTokens: number
    cacheCreationInputTokens: number
    cacheReadInputTokens: number
  }>
}

/**
 * Build normalized TokenUsage from Anthropic's usage object.
 *
 * `promptTokens` is the total input: uncached + cache read + cache write.
 * Anthropic's `input_tokens` counts only the uncached part, so this function
 * adds the cache parts. The cache parts are also in `promptTokensDetails`:
 * `cachedTokens` (read), `cacheWriteTokens` (write), and `cacheWrite1hTokens`
 * (the 1-hour part of the write). `totalTokens` is
 * `promptTokens + completionTokens`.
 *
 * Also handles server tool use metrics. Returns `undefined` when the provider
 * reported no usage object, so callers omit the field rather than fabricating
 * zeroed totals.
 */
export function buildAnthropicUsage(
  usage:
    | Anthropic_SDK.Beta.BetaUsage
    | Anthropic_SDK.Beta.BetaMessageDeltaUsage
    | undefined
    | null,
  start?: Anthropic_SDK.Beta.BetaUsage,
): TokenUsage<AnthropicProviderUsageDetails> | undefined {
  if (!usage) return undefined

  const inputTokens = usage.input_tokens ?? start?.input_tokens ?? 0
  // `|| 0` (rather than `?? 0`) matches the sibling builders and stays defensive
  // against a runtime-absent count without tripping no-unnecessary-condition
  // (the SDK types output_tokens as a required number).
  const outputTokens = usage.output_tokens || 0
  const cacheCreation =
    usage.cache_creation_input_tokens ?? start?.cache_creation_input_tokens
  const cacheRead =
    usage.cache_read_input_tokens ?? start?.cache_read_input_tokens
  // The 1-hour part of the cache write. A closing message_delta has no
  // `cache_creation`, so a stream takes message_start's.
  const cacheWrite1h = (
    ('cache_creation' in usage ? usage.cache_creation : null) ??
    start?.cache_creation
  )?.ephemeral_1h_input_tokens
  // `input_tokens` is only the uncached part. Add the cache parts so
  // promptTokens is the total input, the same as the other adapters.
  const promptTokens = inputTokens + (cacheRead ?? 0) + (cacheCreation ?? 0)

  const result = buildBaseUsage<AnthropicProviderUsageDetails>({
    promptTokens,
    completionTokens: outputTokens,
    totalTokens: promptTokens + outputTokens,
  })

  // Add prompt token details for cache tokens. Only attach the details object
  // when at least one field is present so we don't emit an empty `{}` (every
  // other adapter guards with the same Object.keys check).
  const promptTokensDetails = {
    ...(cacheCreation ? { cacheWriteTokens: cacheCreation } : {}),
    ...(cacheWrite1h ? { cacheWrite1hTokens: cacheWrite1h } : {}),
    ...(cacheRead ? { cachedTokens: cacheRead } : {}),
  }
  if (Object.keys(promptTokensDetails).length > 0) {
    result.promptTokensDetails = promptTokensDetails
  }

  // The closing message_delta has the cumulative count, so a stream does not
  // take message_start's. Zero is kept.
  const thinkingTokens = usage.output_tokens_details?.thinking_tokens
  if (thinkingTokens !== undefined) {
    result.completionTokensDetails = { reasoningTokens: thinkingTokens }
  }

  // Add provider-specific usage details for server tool use, again only when
  // the provider actually reported any server tool requests.
  const serverToolUse = usage.server_tool_use ?? start?.server_tool_use
  const serverToolUseDetails = {
    ...(serverToolUse?.web_search_requests
      ? { webSearchRequests: serverToolUse.web_search_requests }
      : {}),
    ...(serverToolUse?.web_fetch_requests
      ? { webFetchRequests: serverToolUse.web_fetch_requests }
      : {}),
  }
  const iterations = usage.iterations?.map((iteration) => ({
    type: iteration.type,
    ...('model' in iteration && iteration.model
      ? { model: iteration.model }
      : {}),
    inputTokens: iteration.input_tokens,
    outputTokens: iteration.output_tokens,
    cacheCreationInputTokens: iteration.cache_creation_input_tokens,
    cacheReadInputTokens: iteration.cache_read_input_tokens,
  }))
  const providerUsageDetails: AnthropicProviderUsageDetails = {
    ...(Object.keys(serverToolUseDetails).length > 0
      ? { serverToolUse: serverToolUseDetails }
      : {}),
    ...(iterations?.length ? { iterations } : {}),
  }
  if (Object.keys(providerUsageDetails).length > 0) {
    result.providerUsageDetails = providerUsageDetails
  }

  return result
}
