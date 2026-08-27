export interface BytePlusThinkingOption {
  type: 'enabled' | 'disabled' | 'auto'
}

export type BytePlusReasoningEffort =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

export type BytePlusServiceTier = 'default' | 'flex'

export interface BytePlusNamedToolChoice {
  type: 'function'
  function: { name: string }
}

export type BytePlusToolChoice =
  | 'none'
  | 'auto'
  | 'required'
  | BytePlusNamedToolChoice

export interface BytePlusTextProviderOptions {
  /** Reasoning switch — see {@link BytePlusThinkingOption}. */
  thinking?: BytePlusThinkingOption

  /** Reasoning budget hint — see {@link BytePlusReasoningEffort}. */
  reasoning_effort?: BytePlusReasoningEffort

  repetition_penalty?: number

  /** Request routing tier — see {@link BytePlusServiceTier}. */
  service_tier?: BytePlusServiceTier

  /** Sampling temperature. Higher values produce more varied output. */
  temperature?: number

  /** Nucleus sampling cutoff. */
  top_p?: number

  /** Restricts sampling to the `k` most likely tokens. */
  top_k?: number

  max_tokens?: number

  max_completion_tokens?: number

  /** Penalizes tokens by how often they have already appeared. */
  frequency_penalty?: number

  /** Penalizes tokens that have appeared at all, regardless of count. */
  presence_penalty?: number

  /** Up to four strings that stop generation when produced. */
  stop?: string | Array<string>

  /** Number of completions to generate. */
  n?: number

  /** Best-effort determinism hint for repeated identical requests. */
  seed?: number

  /** Return log probabilities for the generated tokens. */
  logprobs?: boolean

  /** How many alternatives to report per token. Requires `logprobs`. */
  top_logprobs?: number

  /** Additive bias per token id, applied before sampling. */
  logit_bias?: Record<string, number>

  /** Opaque end-user identifier forwarded for abuse monitoring. */
  user?: string

  /** Whether the model may emit several tool calls in one turn. */
  parallel_tool_calls?: boolean

  /** Tool-selection strategy — see {@link BytePlusToolChoice}. */
  tool_choice?: BytePlusToolChoice
}
