import type { DebugOption } from '@tanstack/ai'

/**
 * OpenAI GPT-Live model options.
 */
export type OpenAILiveModel = 'gpt-live-1' | 'gpt-live-1.1'

/**
 * OpenAI GPT-Live voice options. Other strings are accepted for new voices.
 */
export type OpenAILiveVoice =
  | 'marin'
  | 'quartz'
  | 'ripple'
  | 'vesper'
  | 'willow'
  | 'stone'
  | 'gleam'
  | 'meridian'
  | 'bossa'
  | 'tempo'
  | 'beacon'
  | 'delta'
  | 'cinder'
  | 'nuri'
  | 'juni'
  | 'flitz'
  | 'brise'
  | 'sillage'
  | 'nira'
  | 'harema'
  | 'shida'
  | 'noeul'
  | (string & {})

/**
 * Delegation settings for GPT-Live. GPT-Live sends the hard work (tool calls,
 * long answers) to a Responses API model. Only the server can set these.
 */
export interface OpenAILiveDelegation {
  /** Responses API model that does the delegated work */
  model: string
  /** Instructions for the delegated model */
  instructions?: string
  /** How the delegated model picks tools */
  toolChoice?: 'auto' | 'required' | 'none' | { type: 'function'; name: string }
  /** Lets the delegated model call more than one tool in one turn */
  parallelToolCalls?: boolean
  /** Maximum output tokens for the delegated model (16 or more) */
  maxOutputTokens?: number
}

/**
 * Options for the OpenAI GPT-Live session adapter. It runs on the server.
 * These options win over the config that the browser sends.
 */
export interface OpenAILiveSessionOptions {
  /** Model to use (default: 'gpt-live-1.1') */
  model?: OpenAILiveModel
  /** System instructions. They win over the client instructions. */
  instructions?: string
  /** Output voice. It wins over the client voice. */
  voice?: OpenAILiveVoice
  /** Delegation settings. Required when the client sends tools. */
  delegation?: OpenAILiveDelegation
  /** Lets OpenAI store the session */
  store?: boolean
  /** OpenAI API key (default: the OPENAI_API_KEY environment variable) */
  apiKey?: string
  /** API base URL (default: 'https://api.openai.com/v1') */
  baseURL?: string
}

/**
 * Options for the OpenAI GPT-Live client adapter. It runs in the browser.
 */
export interface OpenAILiveOptions {
  /**
   * Enable debug logging for this adapter.
   *
   * - `true` enables all categories (`request`, `response`, `provider`, `errors`).
   * - A {@link DebugConfig} object selects categories and/or a custom sink.
   */
  debug?: DebugOption
}
