import type { VADConfig } from '@tanstack/ai'
import type { OpenAIRealtimeModel as CatalogRealtimeModel } from '../meta/realtime'

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
export type OpenAIRealtimeModel = CatalogRealtimeModel

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
  /** Model to use (default: 'gpt-realtime-1.5') */
  model?: OpenAIRealtimeModel
}

/**
 * Options for the OpenAI realtime client adapter
 */
export interface OpenAIRealtimeOptions {
  /** Connection mode (default: 'webrtc' in browser) */
  connectionMode?: 'webrtc' | 'websocket'
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
