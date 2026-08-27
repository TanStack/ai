import type {
  AnyClientTool,
  RealtimeMessage,
  RealtimeMode,
  RealtimeSessionConfig,
  RealtimeStatus,
  RealtimeToken,
  UsageInfo,
} from '@tanstack/ai'
import type { RealtimeAdapter } from '@tanstack/ai-client'

export interface UseRealtimeChatOptions {
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

  // Callbacks
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Error) => void
  onMessage?: (message: RealtimeMessage) => void
  onModeChange?: (mode: RealtimeMode) => void
  onInterrupted?: () => void
  onUsage?: (usage: UsageInfo) => void
  onGoAway?: (timeLeft?: string) => void
  onStatusChange?: (status: RealtimeStatus) => void
}

export interface UseRealtimeChatReturn {
  // Connection state
  /** Current connection status */
  status: RealtimeStatus
  /** Current error, if any */
  error: Error | null
  /** Connect to the realtime session */
  connect: () => Promise<void>
  /** Disconnect from the realtime session */
  disconnect: () => Promise<void>

  // Conversation state
  /** Current mode (idle, listening, thinking, speaking) */
  mode: RealtimeMode
  /** Conversation messages */
  messages: Array<RealtimeMessage>
  /** User transcript while speaking (before finalized) */
  pendingUserTranscript: string | null
  /** Assistant transcript while speaking (before finalized) */
  pendingAssistantTranscript: string | null

  // Voice control
  /** Start listening for voice input (manual VAD mode) */
  startListening: () => void
  /** Stop listening for voice input (manual VAD mode) */
  stopListening: () => void
  /** Interrupt the current assistant response */
  interrupt: () => void

  // Text input
  /** Send a text message instead of voice */
  sendText: (text: string) => void

  // Image input
  /** Send an image to the conversation */
  sendImage: (imageData: string, mimeType: string) => void

  // Audio visualization (0-1 normalized)
  /** Current input (microphone) volume level */
  inputLevel: number
  /** Current output (speaker) volume level */
  outputLevel: number
  /** Get frequency data for input audio visualization */
  getInputFrequencyData: () => Uint8Array
  /** Get frequency data for output audio visualization */
  getOutputFrequencyData: () => Uint8Array
  /** Get time domain data for input waveform */
  getInputTimeDomainData: () => Uint8Array
  /** Get time domain data for output waveform */
  getOutputTimeDomainData: () => Uint8Array

  // Session control
  /** Update the active session and persist the configuration for reconnects. */
  updateSession: (config: RealtimeSessionConfig) => void
}
