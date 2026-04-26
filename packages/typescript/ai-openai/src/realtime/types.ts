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
 * OpenAI realtime model options
 */
export type OpenAIRealtimeModel =
  | 'gpt-4o-realtime-preview'
  | 'gpt-4o-realtime-preview-2024-10-01'
  | 'gpt-4o-mini-realtime-preview'
  | 'gpt-4o-mini-realtime-preview-2024-12-17'
  | 'gpt-realtime'
  | 'gpt-realtime-mini'

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
  /** Model to use (default: 'gpt-4o-realtime-preview') */
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
 * OpenAI realtime session response from the API
 */
export interface OpenAIRealtimeSessionResponse {
  id: string
  object: 'realtime.session'
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
