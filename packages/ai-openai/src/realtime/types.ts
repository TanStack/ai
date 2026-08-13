import type { DebugOption, VADConfig } from '@tanstack/ai'

/**
 * OpenAI realtime voice options
 */
export type OpenAIRealtimeVoice =
  | 'alloy'
  | 'ash'
  | 'ballad'
  | 'coral'
  | 'echo'
  | 'sage'
  | 'shimmer'
  | 'verse'
  | 'marin'
  | 'cedar'

/**
 * OpenAI realtime model options.
 *
 * The `gpt-4o-(mini-)realtime-preview` models were shut down by OpenAI on
 * 2026-05-07 and are no longer listed here.
 */
export type OpenAIRealtimeModel = 'gpt-realtime' | 'gpt-realtime-mini'

/**
 * OpenAI semantic VAD configuration
 */
export interface OpenAISemanticVADConfig {
  type: 'semantic_vad'
  /** Eagerness level for turn detection */
  eagerness?: 'low' | 'medium' | 'high'
}

/**
 * OpenAI server VAD configuration
 */
export interface OpenAIServerVADConfig extends VADConfig {
  type: 'server_vad'
}

/**
 * OpenAI turn detection configuration
 */
export type OpenAITurnDetection =
  | OpenAISemanticVADConfig
  | OpenAIServerVADConfig
  | null

/**
 * Options for the OpenAI realtime token adapter
 */
export interface OpenAIRealtimeTokenOptions {
  /** Model to use (default: 'gpt-realtime') */
  model?: OpenAIRealtimeModel
}

/**
 * Options for the OpenAI realtime client adapter
 */
export interface OpenAIRealtimeOptions {
  /** Connection mode (default: 'webrtc' in browser) */
  connectionMode?: 'webrtc' | 'websocket'
  /**
   * Enable debug logging for this adapter.
   *
   * - `true` enables all categories (`request`, `response`, `provider`, `errors`).
   * - A {@link DebugConfig} object selects categories and/or a custom sink.
   */
  debug?: DebugOption
}

/**
 * OpenAI GA realtime client secret response from
 * `POST /v1/realtime/client_secrets`. Minimal shape — only the fields the
 * token adapter reads.
 */
export interface OpenAIRealtimeClientSecretResponse {
  /** Ephemeral key (`ek_…`) used as the bearer token for the WebRTC SDP exchange */
  value: string
  /** Unix timestamp (seconds) when the ephemeral key expires */
  expires_at: number
  /** Effective session config the key was minted for */
  session: {
    type: string
    model: string
  }
}
