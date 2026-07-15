/**
 * Provider options honored by the Bedrock **Converse** path. Deliberately
 * narrower than the OpenAI-compatible `BedrockTextProviderOptions`: the Converse
 * API only accepts these sampling knobs (mapped into `inferenceConfig`), so
 * advertising the full Chat Completions option set would promise fields —
 * `frequency_penalty`, `seed`, `logit_bias`, `tool_choice`, `reasoning_effort`,
 * etc. — that Converse silently ignores. Field names mirror the Chat
 * Completions shape so callers have one mental model across the three APIs.
 */
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
