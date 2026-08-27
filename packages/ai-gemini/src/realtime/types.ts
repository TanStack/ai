import type {
  ContextWindowCompressionConfig,
  LiveConnectConstraints,
  ThinkingConfig,
} from '@google/genai'

export type GeminiRealtimeVoice =
  | 'Achernar'
  | 'Achird'
  | 'Algenib'
  | 'Algieba'
  | 'Alnilam'
  | 'Aoede'
  | 'Autonoe'
  | 'Callirrhoe'
  | 'Charon'
  | 'Despina'
  | 'Enceladus'
  | 'Erinome'
  | 'Fenrir'
  | 'Gacrux'
  | 'Iapetus'
  | 'Kore'
  | 'Laomedeia'
  | 'Leda'
  | 'Orus'
  | 'Pulcherrima'
  | 'Puck'
  | 'Rasalgethi'
  | 'Sadachbia'
  | 'Sadaltager'
  | 'Schedar'
  | 'Sulafat'
  | 'Umbriel'
  | 'Vindemiatrix'
  | 'Zephyr'
  | 'Zubenelgenubi'

export type GeminiRealtimeModel = 'gemini-3.1-flash-live-preview'

export interface GeminiRealtimeOptions {
  /** Connection mode (default: 'websocket' in browser) */
  connectionMode?: 'websocket'
  model?: GeminiRealtimeModel
}

export interface StrictLiveConnectionConstraints extends Omit<
  LiveConnectConstraints,
  'model'
> {
  model?: GeminiRealtimeModel
}

export interface GeminiRealtimeTokenOptions {
  expiresAt?: number
  uses?: number
  liveConnectConstraints?: StrictLiveConnectionConstraints
}

export interface GeminiRealtimeProviderOptions {
  /** Enable Google Search grounding (mutually exclusive with custom tools). */
  googleGrounding?: boolean
  /** Enable proactive audio so the model may choose when to respond. */
  proactiveAudio?: boolean
  /** Enable affective (emotion-aware) dialog. */
  enableAffectiveDialog?: boolean
  /** Context window compression configuration. */
  contextWindowCompression?: ContextWindowCompressionConfig
  /** Thinking configuration. */
  thinkingConfig?: ThinkingConfig
  /** BCP-47 language code for speech output. */
  languageCode?: string
}
