import type { StreamChunk } from '@tanstack/ai'
import type { ConnectConnectionAdapter } from './connection-adapters'

// ===========================
// Inference Utilities
// ===========================

/**
 * Infers the output type from an `onResult` callback's return type.
 *
 * - If the callback returns a concrete type (excluding null/void/undefined), uses that type.
 * - If the callback only returns null/void/undefined, or is not provided, falls back to TResult.
 *
 * @template TResult - The raw result type from the generation
 * @template TFn - The onResult callback type (or undefined if not provided)
 */
export type InferGenerationOutput<TResult, TFn> = TFn extends (
  result: any,
) => infer R
  ? [Exclude<R, null | void | undefined>] extends [never]
    ? TResult
    : Exclude<R, null | void | undefined>
  : TResult

// ===========================
// State
// ===========================

/**
 * State machine for generation clients.
 * Simpler than ChatClientState since generation is a single request/response cycle.
 */
export type GenerationClientState = 'idle' | 'generating' | 'success' | 'error'

// ===========================
// Event Constants
// ===========================

/**
 * Well-known CUSTOM event names used by generation clients.
 * These events are emitted by the server-side streaming helpers
 * and consumed by the client-side GenerationClient.
 */
export const GENERATION_EVENTS = {
  /** The generation result payload */
  RESULT: 'generation:result',
  /** Progress update (0-100) with optional message */
  PROGRESS: 'generation:progress',
  /** Video job created with jobId */
  VIDEO_JOB_CREATED: 'video:job:created',
  /** Video job status update */
  VIDEO_STATUS: 'video:status',
} as const

// ===========================
// Transport Types
// ===========================

/**
 * Options passed to a fetcher function by the generation client.
 */
export interface GenerationFetcherOptions {
  /** AbortSignal that is triggered when the user calls `stop()` */
  signal: AbortSignal
}

/**
 * A direct async function that performs a generation request.
 *
 * Can return the result directly, or return a `Response` with an SSE body
 * (e.g., from a TanStack Start server function using `toServerSentEventsResponse()`).
 * When a `Response` is returned, the client will parse it as an SSE stream.
 *
 * @template TInput - The input type for the generation request
 * @template TResult - The result type returned by the generation
 */
export type GenerationFetcher<TInput, TResult> = (
  input: TInput,
  options?: GenerationFetcherOptions,
) => Promise<TResult | Response>

/**
 * Transport configuration for generation clients.
 * Supports either a connect-based streaming adapter or a direct fetcher function.
 */
export type GenerationTransport<TInput, TResult> =
  | { connection: ConnectConnectionAdapter; fetcher?: never }
  | { fetcher: GenerationFetcher<TInput, TResult>; connection?: never }

// ===========================
// Client Options
// ===========================

/**
 * Options for the GenerationClient.
 *
 * @template TInput - The input type for the generation request (used by consuming code)
 * @template TResult - The result type returned by the generation
 * @template TOutput - The output type after optional transform (defaults to TResult)
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface GenerationClientOptions<_TInput, TResult, TOutput = TResult> {
  /** Unique identifier for this generation client instance */
  id?: string

  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>

  /**
   * Callback when a result is received. Can optionally return a transformed value
   * that replaces the stored result.
   *
   * - Return a non-null value to transform and store it as the result
   * - Return `null` to keep the previous result unchanged
   * - Return nothing (`void`) to store the raw result as-is
   */
  onResult?: (result: TResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void

  // Framework state callbacks (set by hooks, not users)
  /** @internal Called when result changes */
  onResultChange?: (result: TOutput | null) => void
  /** @internal Called when loading state changes */
  onLoadingChange?: (isLoading: boolean) => void
  /** @internal Called when error state changes */
  onErrorChange?: (error: Error | undefined) => void
  /** @internal Called when generation status changes */
  onStatusChange?: (status: GenerationClientState) => void
}

// ===========================
// Video-Specific Options
// ===========================

/**
 * Video status information returned during job polling.
 */
export interface VideoStatusInfo {
  /** Job identifier */
  jobId: string
  /** Current status of the video generation job */
  status: 'pending' | 'processing' | 'completed' | 'failed'
  /** Progress percentage (0-100), if available */
  progress?: number
  /** URL to the generated video (when completed) */
  url?: string
  /** Error message if status is 'failed' */
  error?: string
}

/**
 * Composite result for video generation (job completion).
 */
export interface VideoGenerateResult {
  /** Job identifier */
  jobId: string
  /** Final status */
  status: 'completed'
  /** URL to the generated video */
  url: string
  /** When the URL expires, if applicable */
  expiresAt?: Date
}

/**
 * Options for the VideoGenerationClient.
 */
export interface VideoGenerationClientOptions<
  TOutput = VideoGenerateResult,
> extends GenerationClientOptions<
  VideoGenerateInput,
  VideoGenerateResult,
  TOutput
> {
  /** Callback when a video job is created */
  onJobCreated?: (jobId: string) => void
  /** Callback on each status update */
  onStatusUpdate?: (status: VideoStatusInfo) => void

  // Framework state callbacks
  /** @internal Called when jobId changes */
  onJobIdChange?: (jobId: string | null) => void
  /** @internal Called when video status changes */
  onVideoStatusChange?: (status: VideoStatusInfo | null) => void
}

// ===========================
// Input Types
// ===========================

/**
 * Input for image generation.
 */
export interface ImageGenerateInput {
  /** Text description of the desired image(s) */
  prompt: string
  /** Number of images to generate (default: 1) */
  numberOfImages?: number
  /** Image size in WIDTHxHEIGHT format (e.g., "1024x1024") */
  size?: string
  /** Model-specific options */
  modelOptions?: Record<string, any>
}

/**
 * Input for audio generation (music, sound effects).
 */
export interface AudioGenerateInput {
  /** Text description of the desired audio */
  prompt: string
  /** Desired duration in seconds */
  duration?: number
  /** Model-specific options */
  modelOptions?: Record<string, any>
}

/**
 * Input for text-to-speech generation.
 */
export interface SpeechGenerateInput {
  /** The text to convert to speech */
  text: string
  /** The voice to use for generation */
  voice?: string
  /** The output audio format */
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
  /** The speed of the generated audio (0.25 to 4.0) */
  speed?: number
  /** Model-specific options */
  modelOptions?: Record<string, any>
}

/**
 * Input for audio transcription.
 */
export interface TranscriptionGenerateInput {
  /** The audio data to transcribe - can be base64 string, File, Blob, or ArrayBuffer */
  audio: string | File | Blob | ArrayBuffer
  /** The language of the audio in ISO-639-1 format (e.g., 'en') */
  language?: string
  /** An optional prompt to guide the transcription */
  prompt?: string
  /** The format of the transcription output */
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt'
  /** Model-specific options */
  modelOptions?: Record<string, any>
}

/**
 * Input for text summarization.
 */
export interface SummarizeGenerateInput {
  /** The text to summarize */
  text: string
  /** Maximum length of the summary */
  maxLength?: number
  /** Style of the summary */
  style?: 'bullet-points' | 'paragraph' | 'concise'
  /** Topics to focus on */
  focus?: Array<string>
  /** Model-specific options */
  modelOptions?: Record<string, any>
}

/**
 * Input for video generation.
 */
export interface VideoGenerateInput {
  /** Text description of the desired video */
  prompt: string
  /** Video size — format depends on provider (e.g., "16:9", "1280x720") */
  size?: string
  /** Video duration in seconds */
  duration?: number
  /** Model-specific options */
  modelOptions?: Record<string, any>
}
