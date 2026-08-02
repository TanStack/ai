/**
 * BytePlus ModelArk chat provider options.
 *
 * Ark's `/chat/completions` is OpenAI-compatible, so most of this is the
 * familiar sampling surface; `thinking`, `reasoning_effort`,
 * `repetition_penalty` and `service_tier` are the Ark-only additions.
 *
 * Every field below was accepted by a live request against
 * `https://ark.ap-southeast.bytepluses.com/api/v3` on 2026-07-31. Two probe
 * results are encoded as TSDoc warnings rather than types because they are
 * cross-field constraints TypeScript can't express: `max_tokens` and
 * `max_completion_tokens` are mutually exclusive, and `reasoning_effort`
 * combined with `thinking: {type: 'disabled'}` is a 400.
 *
 * `response_format` is deliberately absent — the chat activity owns it via
 * `outputSchema` / structured output, and Ark rejects `json_object` outright
 * on every model.
 */

/**
 * Reasoning ("deep thinking") switch.
 *
 * - `enabled` — the model reasons before answering (default on every model
 *   except `deepseek-v3-2-251201`, where reasoning defaults to off).
 * - `disabled` — skip reasoning.
 * - `auto` — let the model decide. Only accepted by `gpt-oss-120b-250805`.
 */
export interface BytePlusThinkingOption {
  type: 'enabled' | 'disabled' | 'auto'
}

/**
 * Reasoning budget hint. `none` and `xhigh` are only accepted by
 * `glm-5-2-260617`; `max` by `glm-5-2-260617` and the `deepseek-v4-*` models.
 *
 * Cannot be combined with `thinking: {type: 'disabled'}` — Ark rejects the
 * pair with `400 InvalidParameter` ("Invalid combination of reasoning_effort
 * and thinking type").
 */
export type BytePlusReasoningEffort =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

/**
 * Request routing tier. `flex` routes to the batch queue at a lower price with
 * no latency guarantee; `default` is the standard online tier.
 */
export type BytePlusServiceTier = 'default' | 'flex'

/**
 * Forces the model to call one specific function.
 */
export interface BytePlusNamedToolChoice {
  type: 'function'
  function: { name: string }
}

/**
 * Controls which (if any) tool the model calls.
 */
export type BytePlusToolChoice =
  | 'none'
  | 'auto'
  | 'required'
  | BytePlusNamedToolChoice

/**
 * Provider options for BytePlus chat models.
 */
export interface BytePlusTextProviderOptions {
  // --------------------------------------------------------------------
  // Ark-only
  // --------------------------------------------------------------------

  /** Reasoning switch — see {@link BytePlusThinkingOption}. */
  thinking?: BytePlusThinkingOption

  /** Reasoning budget hint — see {@link BytePlusReasoningEffort}. */
  reasoning_effort?: BytePlusReasoningEffort

  /**
   * Penalty applied to repeated tokens. Values above 1 discourage repetition.
   */
  repetition_penalty?: number

  /** Request routing tier — see {@link BytePlusServiceTier}. */
  service_tier?: BytePlusServiceTier

  // --------------------------------------------------------------------
  // OpenAI-compatible sampling surface
  // --------------------------------------------------------------------

  /** Sampling temperature. Higher values produce more varied output. */
  temperature?: number

  /** Nucleus sampling cutoff. */
  top_p?: number

  /** Restricts sampling to the `k` most likely tokens. */
  top_k?: number

  /**
   * Maximum tokens to generate. Mutually exclusive with
   * `max_completion_tokens` — sending both is a 400.
   */
  max_tokens?: number

  /**
   * OpenAI's newer name for {@link BytePlusTextProviderOptions.max_tokens}.
   * Mutually exclusive with it.
   */
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
