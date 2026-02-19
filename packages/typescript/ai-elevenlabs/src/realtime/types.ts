/**
 * Options for the ElevenLabs realtime token adapter
 */
export interface ElevenLabsRealtimeTokenOptions {
  /** Agent ID configured in ElevenLabs dashboard */
  agentId: string
  /** Optional override values for the agent */
  overrides?: {
    /** Custom voice ID to use */
    voiceId?: string
    /** Custom system prompt */
    systemPrompt?: string
    /** First message the agent should speak */
    firstMessage?: string
    /** Language code (e.g., 'en') */
    language?: string
  }
}

/**
 * Options for the ElevenLabs realtime client adapter
 */
export interface ElevenLabsRealtimeOptions {
  /** Connection mode (default: auto-detect) */
  connectionMode?: 'websocket' | 'webrtc'
  /** Enable debug logging */
  debug?: boolean
}

/**
 * ElevenLabs conversation mode
 */
export type ElevenLabsConversationMode = 'speaking' | 'listening'

/**
 * ElevenLabs voice activity detection configuration
 */
export interface ElevenLabsVADConfig {
  /** VAD threshold (0.1-0.9) */
  vadThreshold?: number
  /** Silence threshold in seconds (0.3-3.0) */
  vadSilenceThresholdSecs?: number
  /** Minimum speech duration in ms */
  minSpeechDurationMs?: number
  /** Minimum silence duration in ms */
  minSilenceDurationMs?: number
}

/**
 * Client tool definition for ElevenLabs
 */
export interface ElevenLabsClientTool<TParams = unknown, TResult = unknown> {
  /** Tool handler function */
  handler: (params: TParams) => Promise<TResult> | TResult
}
