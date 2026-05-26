import type {
  AnyClientTool,
  AudioVisualization,
  RealtimeEvent,
  RealtimeEventHandler,
  RealtimeMessage,
  RealtimeMode,
  RealtimeSessionConfig,
  RealtimeStatus,
  RealtimeToken,
} from '@tanstack/ai'

// ============================================================================
// Adapter Interface
// ============================================================================

/**
 * Adapter interface for connecting to realtime providers.
 * Each provider (OpenAI, ElevenLabs, etc.) implements this interface.
 */
export interface RealtimeAdapter {
  /** Provider identifier */
  provider: string

  /**
   * Create a connection using the provided token
   * @param token - The ephemeral token from the server
   * @param clientTools - Optional client-side tools to register with the provider
   * @returns A connection instance
   */
  connect: (
    token: RealtimeToken,
    clientTools?: ReadonlyArray<AnyClientTool>,
  ) => Promise<RealtimeConnection>
}

/**
 * Connection interface representing an active realtime session.
 * Handles audio I/O, events, and session management.
 */
export interface RealtimeConnection {
  // Lifecycle
  /** Disconnect from the realtime session */
  disconnect: () => Promise<void>

  // Audio I/O
  /** Start capturing audio from the microphone */
  startAudioCapture: () => Promise<void>
  /** Stop capturing audio */
  stopAudioCapture: () => void

  // Text input
  /** Send a text message (fallback for when voice isn't available) */
  sendText: (text: string) => void

  // Image input
  /** Send an image to the conversation */
  sendImage: (imageData: string, mimeType: string) => void

  // Tool results
  /** Send a tool execution result back to the provider */
  sendToolResult: (callId: string, result: string) => void

  // Session management
  /** Update session configuration */
  updateSession: (config: Partial<RealtimeSessionConfig>) => void
  /** Interrupt the current response */
  interrupt: () => void

  // Events
  /** Subscribe to connection events */
  on: <TEvent extends RealtimeEvent>(
    event: TEvent,
    handler: RealtimeEventHandler<TEvent>,
  ) => () => void

  // Audio visualization
  /** Get audio visualization data */
  getAudioVisualization: () => AudioVisualization
}

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
