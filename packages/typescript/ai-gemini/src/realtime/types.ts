/**
 * Gemini realtime model options
 */
export type GeminiRealtimeModel = 'gemini-live-2.5-flash-native-audio'

/**
 * Options for the Gemini realtime client adapter
 */
export interface GeminiRealtimeOptions {
  /** Connection mode (default: 'websocket' in browser) */
  connectionMode?: 'websocket'
}

/**
 * Options for the Gemini realtime token adapter
 */
export interface GeminiRealtimeTokenOptions {
  /** Model to use (default: 'gemini-live-2.5-flash-native-audio') */
  model?: GeminiRealtimeModel
  expiresAt?: number
  maxOutputTokens?: number
}

/**
 * Gemini Realtime session response from the API
 */
export interface GeminiRealtimeSessionResponse {}
