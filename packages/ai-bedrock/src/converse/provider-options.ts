export interface BedrockConverseProviderOptions {
  /** Forwarded to Converse `inferenceConfig.temperature`. */
  temperature?: number | null
  /** Forwarded to Converse `inferenceConfig.topP`. */
  top_p?: number | null
  /** Forwarded to Converse `inferenceConfig.maxTokens`. */
  max_completion_tokens?: number | null
  /** Forwarded to Converse `inferenceConfig.stopSequences`. */
  stop?: string | Array<string> | null
}
