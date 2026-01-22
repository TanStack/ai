/**
 * Gemini-specific provider usage details.
 * These fields are unique to Gemini and placed in providerUsageDetails.
 */
export interface GeminiProviderUsageDetails {
  /**
   * The traffic type for this request.
   * Can indicate whether request was handled by different service tiers.
   */
  trafficType?: string
  /**
   * Number of tokens in the results from tool executions,
   * which are provided back to the model as input.
   */
  toolUsePromptTokenCount?: number
  /**
   * Detailed breakdown by modality of the token counts from
   * the results of tool executions.
   */
  toolUsePromptTokensDetails?: Array<{
    modality: string
    tokenCount: number
  }>
  /**
   * Detailed breakdown of cache tokens by modality.
   * More granular than the normalized cachedTokens field.
   */
  cacheTokensDetails?: Array<{
    modality: string
    tokenCount: number
  }>
  /** Index signature for Record<string, unknown> compatibility */
  [key: string]: unknown
}
