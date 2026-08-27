import type {
  AnyClientTool,
  RealtimeAdapter,
  RealtimeMessage,
  RealtimeMode,
  RealtimeStatus,
  RealtimeToken,
} from '@tanstack/ai/client'
import type { UsageInfo } from '@tanstack/ai'

export type { RealtimeAdapter, RealtimeConnection } from '@tanstack/ai/client'

export interface RealtimeClientOptions {
  getToken: () => Promise<RealtimeToken>

  adapter: RealtimeAdapter

  tools?: ReadonlyArray<AnyClientTool>

  autoPlayback?: boolean

  autoCapture?: boolean

  instructions?: string

  voice?: string

  vadMode?: 'server' | 'semantic' | 'manual'

  outputModalities?: Array<'audio' | 'text'>

  temperature?: number

  maxOutputTokens?: number | 'inf'

  semanticEagerness?: 'low' | 'medium' | 'high'

  providerOptions?: Record<string, unknown>

  // Callbacks
  onStatusChange?: (status: RealtimeStatus) => void
  onModeChange?: (mode: RealtimeMode) => void
  onMessage?: (message: RealtimeMessage) => void
  onError?: (error: Error) => void
  onConnect?: () => void
  onDisconnect?: () => void
  onInterrupted?: () => void
  onUsage?: (usage: UsageInfo) => void
  onGoAway?: (timeLeft?: string) => void
}

export interface RealtimeClientState {
  status: RealtimeStatus
  mode: RealtimeMode
  messages: Array<RealtimeMessage>
  pendingUserTranscript: string | null
  pendingAssistantTranscript: string | null
  error: Error | null
}

export type RealtimeStateChangeCallback = (state: RealtimeClientState) => void
