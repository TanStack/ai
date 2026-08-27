import type { DebugOption, VADConfig } from '@tanstack/ai'
import type { GrokRealtimeModel } from '../model-meta'

export type GrokRealtimeVoice = 'eve' | 'ara' | 'rex' | 'sal' | 'leo'

export interface GrokSemanticVADConfig {
  type: 'semantic_vad'
  /** Eagerness level for turn detection */
  eagerness?: 'low' | 'medium' | 'high'
}

export interface GrokServerVADConfig extends VADConfig {
  type: 'server_vad'
}

export type GrokTurnDetection =
  | GrokSemanticVADConfig
  | GrokServerVADConfig
  | null

export interface GrokRealtimeTokenOptions {
  /** Model to use (default: 'grok-voice-think-fast-2.0'). */
  model?: GrokRealtimeModel
  debug?: DebugOption
}

export interface GrokRealtimeOptions {
  /** Connection mode (default: 'webrtc' in browser). */
  connectionMode?: 'webrtc' | 'websocket'
  debug?: DebugOption
}

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
