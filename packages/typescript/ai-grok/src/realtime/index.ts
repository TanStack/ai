// Token adapter for server-side use
export { grokRealtimeToken } from './token'

// Client adapter for browser use
export { grokRealtime } from './adapter'

// Types
export type {
  GrokRealtimeVoice,
  GrokRealtimeTokenOptions,
  GrokRealtimeOptions,
  GrokTurnDetection,
  GrokSemanticVADConfig,
  GrokServerVADConfig,
} from './types'

// Re-export the realtime model type from the single source of truth.
export type { GrokRealtimeModel } from '../model-meta'
