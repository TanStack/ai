/**
 * BytePlus ModelArk chat provider options.
 *
 * These are the Ark-only extensions on top of the OpenAI-compatible
 * `/chat/completions` body. Everything else (temperature, top_p, tools,
 * response_format, …) is handled by the shared OpenAI base adapter.
 *
 * Verified live against `https://ark.ap-southeast.bytepluses.com/api/v3`
 * (2026-07-31): `thinking: {type: 'enabled'}` returns `reasoning_content` +
 * `encrypted_content` on the assistant message, and OpenAI-shaped
 * `tools[].type: 'function'` is accepted (the docs' `'function_call'` value
 * is rejected with 400 InvalidParameter).
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
 * Provider options for BytePlus chat models.
 */
export interface BytePlusTextProviderOptions {
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
}
