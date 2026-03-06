import type {
  AnyClientTool,
  RealtimeMessage,
  RealtimeMode,
  RealtimeStatus,
  RealtimeToken,
} from '@tanstack/ai'
import type { RealtimeAdapter } from '@tanstack/ai-client'

/**
 * Options for the useRealtimeChat hook.
 */
export interface UseRealtimeChatOptions {
  /**
   * Function to fetch a realtime token from the server.
   * Called on connect and when token needs refresh.
   */
  getToken: () => Promise<RealtimeToken>

  /**
   * The realtime adapter to use (e.g., openaiRealtime())
   */
  adapter: RealtimeAdapter

  /**
   * Client-side tools with execution logic
   */
  tools?: ReadonlyArray<AnyClientTool>

  /**
   * Auto-play assistant audio (default: true)
   */
  autoPlayback?: boolean

  /**
   * Request microphone access on connect (default: true)
   */
  autoCapture?: boolean

  /**
   * System instructions for the assistant
   */
  instructions?: string

  /**
   * Voice to use for audio output
   */
  voice?: string

  /**
   * Voice activity detection mode (default: 'server')
   */
  vadMode?: 'server' | 'semantic' | 'manual'

  // Callbacks
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Error) => void
  onMessage?: (message: RealtimeMessage) => void
  onModeChange?: (mode: RealtimeMode) => void
  onInterrupted?: () => void
}

/**
 * Return type for the useRealtimeChat hook.
 */
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

  // VAD control
  /** Current VAD mode */
  vadMode: 'server' | 'semantic' | 'manual'
  /** Change VAD mode at runtime */
  setVADMode: (mode: 'server' | 'semantic' | 'manual') => void
}
