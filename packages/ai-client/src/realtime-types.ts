import type {
  AnyClientTool,
  RealtimeAdapter,
  RealtimeMessage,
  RealtimeMode,
  RealtimeStatus,
  RealtimeToken,
} from '@tanstack/ai/client'

// The realtime adapter contract lives in `@tanstack/ai` (the shared layer both
// providers and this client depend on) so provider packages don't need to
// depend on `@tanstack/ai-client`. Re-exported here for backwards compatibility
// — `import { RealtimeAdapter } from '@tanstack/ai-client'` keeps working.
export type { RealtimeAdapter, RealtimeConnection } from '@tanstack/ai/client'

// ============================================================================
// Client Options
// ============================================================================

/**
 * Options for the RealtimeClient
 */
export interface RealtimeClientOptions {
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

  /**
   * Output modalities for responses (e.g., ['audio', 'text'])
   */
  outputModalities?: Array<'audio' | 'text'>

  /**
   * Temperature for generation (provider-specific range)
   */
  temperature?: number

  /**
   * Maximum number of tokens in a response
   */
  maxOutputTokens?: number | 'inf'

  /**
   * Eagerness level for semantic VAD ('low', 'medium', 'high')
   */
  semanticEagerness?: 'low' | 'medium' | 'high'

  // Callbacks
  onStatusChange?: (status: RealtimeStatus) => void
  onModeChange?: (mode: RealtimeMode) => void
  onMessage?: (message: RealtimeMessage) => void
  onError?: (error: Error) => void
  onConnect?: () => void
  onDisconnect?: () => void
  onInterrupted?: () => void
}

// ============================================================================
// Client State
// ============================================================================

/**
 * Internal state of the RealtimeClient
 */
export interface RealtimeClientState {
  status: RealtimeStatus
  mode: RealtimeMode
  messages: Array<RealtimeMessage>
  pendingUserTranscript: string | null
  pendingAssistantTranscript: string | null
  error: Error | null
}

/**
 * Callback type for state changes
 */
export type RealtimeStateChangeCallback = (state: RealtimeClientState) => void
