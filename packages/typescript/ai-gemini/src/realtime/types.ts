import type { ContextWindowCompressionConfig, ProactivityConfig, ThinkingConfig } from "@google/genai";

/**
 * Gemini realtime voice options
 */
export type GeminiRealtimeVoice =
  | "Achernar"
  | "Achird"
  | "Algenib"
  | "Algieba"
  | "Alnilam"
  | "Aoede"
  | "Autonoe"
  | "Callirrhoe"
  | "Charon"
  | "Despina"
  | "Enceladus"
  | "Erinome"
  | "Fenrir"
  | "Gacrux"
  | "Iapetus"
  | "Kore"
  | "Laomedeia"
  | "Leda"
  | "Orus"
  | "Pulcherrima"
  | "Puck"
  | "Rasalgethi"
  | "Sadachbia"
  | "Sadaltager"
  | "Schedar"
  | "Sulafat"
  | "Umbriel"
  | "Vindemiatrix"
  | "Zephyr"
  | "Zubenelgenubi";

/**
 * Gemini realtime model options
 */
export type GeminiRealtimeModel = 
  | 'gemini-3.1-flash-live-preview'
  | 'gemini-2.5-flash-native-audio-preview-12-2025'

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
 * Gemini Realtime provider options
 */

export interface GeminiRealtimeProviderOptions {
  languageCode?: string
  contextWindowCompression?: ContextWindowCompressionConfig
  proactivity?: ProactivityConfig
  enableAffectiveDialog?: boolean,
  thinkingConfig?: ThinkingConfig
}