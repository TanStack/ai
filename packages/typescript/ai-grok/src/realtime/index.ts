// Token adapter for server-side use
export { grokRealtimeToken } from './token'

// Client adapter for browser use
export { grokRealtime } from './adapter'

// Types
export type {
  GrokRealtimeVoice,
  GrokRealtimeModel,
  GrokRealtimeTokenOptions,
  GrokRealtimeOptions,
  GrokTurnDetection,
  GrokSemanticVADConfig,
  GrokServerVADConfig,
} from './types'
