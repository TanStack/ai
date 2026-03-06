// ============================================================================
// Token Types
// ============================================================================

/**
 * Voice activity detection configuration
 */
export interface VADConfig {
  /** Sensitivity threshold (0.0-1.0) */
  threshold?: number
  /** Audio to include before speech detection (ms) */
  prefixPaddingMs?: number
  /** Silence duration to end turn (ms) */
  silenceDurationMs?: number
}

/**
 * Serializable tool descriptor for realtime session configuration.
 * Contains only the metadata needed by providers, not Zod schemas or execute functions.
 */
export interface RealtimeToolConfig {
  name: string
  description: string
  inputSchema?: Record<string, any>
}

/**
 * Configuration for a realtime session
 */
export interface RealtimeSessionConfig {
  /** Model to use for the session */
  model?: string
  /** Voice to use for audio output */
  voice?: string
  /** System instructions for the assistant */
  instructions?: string
  /** Tools available in the session */
  tools?: Array<RealtimeToolConfig>
  /** VAD mode */
  vadMode?: 'server' | 'semantic' | 'manual'
  /** VAD configuration */
  vadConfig?: VADConfig
  /** Provider-specific options */
  providerOptions?: Record<string, any>
}

/**
 * Token returned by the server for client authentication
 */
export interface RealtimeToken {
  /** Provider identifier */
  provider: string
  /** The ephemeral token value */
  token: string
  /** Token expiration timestamp (ms since epoch) */
  expiresAt: number
  /** Session configuration embedded in the token */
  config: RealtimeSessionConfig
}

/**
 * Adapter interface for generating provider-specific tokens
 */
export interface RealtimeTokenAdapter {
  /** Provider identifier */
  provider: string
  /** Generate an ephemeral token for client use */
  generateToken: () => Promise<RealtimeToken>
}

/**
 * Options for the realtimeToken function
 */
export interface RealtimeTokenOptions {
  /** The token adapter to use */
  adapter: RealtimeTokenAdapter
}

// ============================================================================
// Message Types
// ============================================================================

/**
 * Text content part in a realtime message
 */
export interface RealtimeTextPart {
  type: 'text'
  content: string
}

/**
 * Audio content part in a realtime message
 */
export interface RealtimeAudioPart {
  type: 'audio'
  /** Transcription of the audio */
  transcript: string
  /** Raw audio data (optional, if stored) */
  audioData?: ArrayBuffer
  /** Duration of the audio in milliseconds */
  durationMs?: number
}

/**
 * Tool call part in a realtime message
 */
export interface RealtimeToolCallPart {
  type: 'tool-call'
  id: string
  name: string
  arguments: string
  input?: unknown
  output?: unknown
}

/**
 * Tool result part in a realtime message
 */
export interface RealtimeToolResultPart {
  type: 'tool-result'
  toolCallId: string
  content: string
}

/**
 * Union of all realtime message parts
 */
export type RealtimeMessagePart =
  | RealtimeTextPart
  | RealtimeAudioPart
  | RealtimeToolCallPart
  | RealtimeToolResultPart

/**
 * A message in a realtime conversation
 */
export interface RealtimeMessage {
  /** Unique message identifier */
  id: string
  /** Message role */
  role: 'user' | 'assistant'
  /** Timestamp when the message was created */
  timestamp: number
  /** Content parts of the message */
  parts: Array<RealtimeMessagePart>
  /** Whether this message was interrupted */
  interrupted?: boolean
  /** Reference to audio buffer if stored */
  audioId?: string
  /** Duration of the audio in milliseconds */
  durationMs?: number
}

// ============================================================================
// Status Types
// ============================================================================

/**
 * Connection status of the realtime client
 */
export type RealtimeStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

/**
 * Current mode of the realtime session
 */
export type RealtimeMode = 'idle' | 'listening' | 'thinking' | 'speaking'

// ============================================================================
// Audio Visualization Types
// ============================================================================

/**
 * Interface for accessing audio visualization data
 */
export interface AudioVisualization {
  /** Input volume level (0-1 normalized) */
  readonly inputLevel: number
  /** Output volume level (0-1 normalized) */
  readonly outputLevel: number

  /** Get frequency data for input audio visualization */
  getInputFrequencyData: () => Uint8Array
  /** Get frequency data for output audio visualization */
  getOutputFrequencyData: () => Uint8Array

  /** Get time domain data for input waveform */
  getInputTimeDomainData: () => Uint8Array
  /** Get time domain data for output waveform */
  getOutputTimeDomainData: () => Uint8Array

  /** Input sample rate */
  readonly inputSampleRate: number
  /** Output sample rate */
  readonly outputSampleRate: number

  /** Subscribe to raw input audio samples */
  onInputAudio?: (
    callback: (samples: Float32Array, sampleRate: number) => void,
  ) => () => void
  /** Subscribe to raw output audio samples */
  onOutputAudio?: (
    callback: (samples: Float32Array, sampleRate: number) => void,
  ) => () => void
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Events emitted by the realtime connection
 */
export type RealtimeEvent =
  | 'status_change'
  | 'mode_change'
  | 'transcript'
  | 'audio_chunk'
  | 'tool_call'
  | 'message_complete'
  | 'interrupted'
  | 'error'

/**
 * Event payloads for realtime events
 */
export interface RealtimeEventPayloads {
  status_change: { status: RealtimeStatus }
  mode_change: { mode: RealtimeMode }
  transcript: {
    role: 'user' | 'assistant'
    transcript: string
    isFinal: boolean
  }
  audio_chunk: { data: ArrayBuffer; sampleRate: number }
  tool_call: { toolCallId: string; toolName: string; input: unknown }
  message_complete: { message: RealtimeMessage }
  interrupted: { messageId?: string }
  error: { error: Error }
}

/**
 * Handler type for realtime events
 */
export type RealtimeEventHandler<TEvent extends RealtimeEvent> = (
  payload: RealtimeEventPayloads[TEvent],
) => void

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes for realtime errors
 */
export type RealtimeErrorCode =
  | 'TOKEN_EXPIRED'
  | 'CONNECTION_FAILED'
  | 'PERMISSION_DENIED'
  | 'PROVIDER_ERROR'
  | 'UNKNOWN'

/**
 * Extended error with realtime-specific information
 */
export interface RealtimeError extends Error {
  code: RealtimeErrorCode
  provider?: string
  details?: unknown
}
