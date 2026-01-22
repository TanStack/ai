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
