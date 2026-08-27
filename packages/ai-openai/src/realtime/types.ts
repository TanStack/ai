import type { DebugOption, VADConfig } from '@tanstack/ai'

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

export type OpenAIRealtimeModel = 'gpt-realtime' | 'gpt-realtime-mini'

export interface OpenAISemanticVADConfig {
  type: 'semantic_vad'
  /** Eagerness level for turn detection */
  eagerness?: 'low' | 'medium' | 'high'
}

export interface OpenAIServerVADConfig extends VADConfig {
  type: 'server_vad'
}

export type OpenAITurnDetection =
  | OpenAISemanticVADConfig
  | OpenAIServerVADConfig
  | null

export interface OpenAIRealtimeTokenOptions {
  /** Model to use (default: 'gpt-realtime') */
  model?: OpenAIRealtimeModel
}

export interface OpenAIRealtimeOptions {
  /** Connection mode (default: 'webrtc' in browser) */
  connectionMode?: 'webrtc' | 'websocket'
  debug?: DebugOption
}

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
