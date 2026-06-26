/**
 * Grok Text Provider Options
 *
 * Grok uses xAI's OpenAI-compatible Responses API. Engine-managed fields
 * such as `model`, `input`, `tools`, and `text.format` are owned by the
 * adapter; user-supplied values live under `modelOptions`.
 */

import type { ResponseCreateParams } from 'openai/resources/responses/responses'

export type GrokReasoningEffort = 'none' | 'low' | 'medium' | 'high'

export type GrokReasoning = Omit<
  NonNullable<ResponseCreateParams['reasoning']>,
  'effort'
> & {
  effort?: GrokReasoningEffort
}

/**
 * Base provider options for Grok text/chat models
 */
export interface GrokBaseOptions {
  /**
   * A unique identifier representing your end-user.
   * Can help xAI to monitor and detect abuse.
   */
  user?: string
}

/**
 * Sampling and response controls for Grok text/chat models.
 */
export interface GrokSamplingOptions {
  /**
   * Temperature for response generation (0-2)
   * Higher values make output more random, lower values more focused
   */
  temperature?: number
  /**
   * Top-p sampling parameter (0-1)
   * Alternative to temperature, nucleus sampling
   */
  top_p?: number
  /**
   * Maximum tokens in the response
   */
  max_output_tokens?: number
  /**
   * Whether xAI should store the response. Defaults to `false` in the adapter.
   */
  store?: boolean
  /**
   * Additional response fields to include. Defaults to encrypted reasoning.
   */
  include?: ResponseCreateParams['include']
  /**
   * xAI/OpenAI-compatible reasoning controls for reasoning-capable models.
   */
  reasoning?: GrokReasoning
}

/**
 * Grok-specific provider options for text/chat
 * Based on xAI Responses API options.
 *
 * Declared as a type-alias intersection of interfaces with all-optional props
 * (matching the OpenAI text adapter), NOT an `interface ... extends
 * Record<string, unknown>`. An explicit index signature makes `object`
 * un-assignable to these options, which breaks the contravariantly-checked
 * `summarize()` adapter constraint (`SummarizeAdapter<string, object>`); see
 * issue #821. Without the index signature these options no longer satisfy a
 * `Record<string, unknown>` constraint, so the text adapter's provider-options
 * generic is widened to `Record<string, any>` to match OpenAI.
 */
export type GrokTextProviderOptions = GrokBaseOptions & GrokSamplingOptions

export type GrokBuildProviderOptions = Omit<
  GrokTextProviderOptions,
  'reasoning'
> & {
  reasoning?: never
}

/**
 * External provider options (what users pass in)
 */
export type ExternalTextProviderOptions = GrokTextProviderOptions
