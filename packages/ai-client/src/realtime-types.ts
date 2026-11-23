import type {
  AnyClientTool,
  RealtimeAdapter,
  RealtimeMessage,
  RealtimeMode,
  RealtimeRelayAdapter,
  RealtimeSessionAnswer,
  RealtimeSessionRequest,
  RealtimeStatus,
  RealtimeToken,
} from '@tanstack/ai/client'
import type { UsageInfo } from '@tanstack/ai'

// ============================================================================
// Client Options
// ============================================================================

/**
 * Options for the RealtimeClient that do not depend on the adapter kind
 */
export interface RealtimeClientBaseOptions {
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

  /**
   * Provider-specific options
   */
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

/**
 * Options for the RealtimeClient.
 * Give a token adapter with `getToken`, or a relay adapter with `createSession`.
 */
export type RealtimeClientOptions = RealtimeClientBaseOptions &
  (
    | {
        /**
         * The realtime adapter to use (e.g., openaiRealtime())
         */
        adapter: RealtimeAdapter
        /**
         * Function to fetch a realtime token from the server.
         * Called on connect and when token needs refresh.
         */
        getToken: () => Promise<RealtimeToken>
        createSession?: never
      }
    | {
        /**
         * The relay adapter to use (e.g., openaiLive())
         */
        adapter: RealtimeRelayAdapter
        /**
         * Sends the SDP offer and the client config to your server.
         * Your server gives the request to `realtimeSession()` and returns
         * the answer. Called once on each connect.
         */
        createSession: (
          request: RealtimeSessionRequest,
        ) => Promise<RealtimeSessionAnswer>
        getToken?: never
      }
  )

// ============================================================================
// Client State
// ============================================================================

/**
 * Internal state of the RealtimeClient
 */
export interface RealtimeClientState {
  readonly status: RealtimeStatus
  readonly mode: RealtimeMode
  readonly messages: ReadonlyArray<RealtimeMessage>
  readonly pendingUserTranscript: string | null
  readonly pendingAssistantTranscript: string | null
  readonly error: Error | null
}

/**
 * Callback type for state changes
 */
export type RealtimeStateChangeCallback = (state: RealtimeClientState) => void
