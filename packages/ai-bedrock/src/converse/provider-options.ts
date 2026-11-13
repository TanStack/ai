import type { ServiceTierType } from '@aws-sdk/client-bedrock-runtime'

/**
 * Provider options honored by the Bedrock **Converse** path. Deliberately
 * narrower than the OpenAI-compatible `BedrockTextProviderOptions`: the Converse
 * API accepts these sampling knobs (mapped into `inferenceConfig`) and request
 * options. Advertising the full Chat Completions option set would promise fields —
 * `frequency_penalty`, `seed`, `logit_bias`, `tool_choice`, `reasoning_effort`,
 * etc. — that Converse silently ignores. Sampling field names mirror the Chat
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
  /** Request metadata for filtering Bedrock model invocation logs. */
  requestMetadata?: Record<string, string>
  /** Inference service tier, forwarded to Converse `serviceTier.type`. */
  serviceTier?: ServiceTierType
}
