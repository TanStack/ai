// Token adapter for server-side use
export { openaiRealtimeToken } from './token'

// Client adapter for browser use
export { openaiRealtime } from './adapter'

// GPT-Live: session adapter for the server, relay adapter for the browser
export { openaiLiveSession } from './live-session'
export { openaiLive } from './live-adapter'

// Types
export type {
  OpenAIRealtimeVoice,
  OpenAIRealtimeModel,
  OpenAIRealtimeTokenOptions,
  OpenAIRealtimeOptions,
  OpenAITurnDetection,
  OpenAISemanticVADConfig,
  OpenAIServerVADConfig,
} from './types'
export type {
  OpenAILiveModel,
  OpenAILiveVoice,
  OpenAILiveDelegation,
  OpenAILiveSessionOptions,
  OpenAILiveOptions,
} from './live-types'
