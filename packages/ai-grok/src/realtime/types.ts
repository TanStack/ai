import type { DebugOption, VADConfig } from '@tanstack/ai'
import type { GrokRealtimeModel } from '../model-meta'

/**
 * Grok realtime voice options (Voice Agent API).
 * https://docs.x.ai/developers/model-capabilities/audio/voice-agent
 */
export type GrokRealtimeVoice = 'eve' | 'ara' | 'rex' | 'sal' | 'leo'

/**
 * Grok semantic VAD configuration.
 */
export interface GrokSemanticVADConfig {
  type: 'semantic_vad'
  /** Eagerness level for turn detection */
  eagerness?: 'low' | 'medium' | 'high'
}

/**
 * Grok server VAD configuration.
 */
export interface GrokServerVADConfig extends VADConfig {
  type: 'server_vad'
}

/**
 * Grok turn detection configuration.
 */
export type GrokTurnDetection =
  | GrokSemanticVADConfig
  | GrokServerVADConfig
  | null

/**
 * Options for the Grok realtime token adapter.
 */
export interface GrokRealtimeTokenOptions {
  /** Model to use (default: 'grok-voice-fast-1.0'). */
  model?: GrokRealtimeModel
  /**
   * Enable debug logging for token creation.
   *
   * - `true`: log all categories via the default `ConsoleLogger`
   * - `false`: silence everything including errors
   * - `DebugConfig`: per-category toggles plus an optional custom `logger`
   * - omitted: only the `errors` category is active (default behaviour)
   */
  debug?: DebugOption
}

/**
 * Options for the Grok realtime client adapter.
 */
export interface GrokRealtimeOptions {
  /** Connection mode (default: 'webrtc' in browser). */
  connectionMode?: 'webrtc' | 'websocket'
  /**
   * Enable debug logging for this adapter.
   *
   * - `true`: log all categories via the default `ConsoleLogger`
   * - `false`: silence everything including errors
   * - `DebugConfig`: per-category toggles plus an optional custom `logger`
   * - omitted: only the `errors` category is active (default behaviour)
   */
  debug?: DebugOption
}

/**
 * Grok realtime session response from the `/v1/realtime/client_secrets`
 * endpoint. Shape matches OpenAI's `/v1/realtime/sessions` response since
 * xAI advertises its voice agent API as OpenAI-realtime-compatible.
 */
export interface GrokRealtimeSessionResponse {
  id: string
  object: string
  model: string
  modalities: Array<string>
  instructions: string
  voice: string
  input_audio_format: string
  output_audio_format: string
  input_audio_transcription: {
    model: string
  } | null
  turn_detection: {
    type: string
    threshold?: number
    prefix_padding_ms?: number
    silence_duration_ms?: number
    eagerness?: string
  } | null
  tools: Array<{
    type: string
    name: string
    description: string
    parameters: Record<string, unknown>
  }>
  tool_choice: string
  temperature: number
  max_response_output_tokens: number | string
  client_secret: {
    value: string
    expires_at: number
  }
}
