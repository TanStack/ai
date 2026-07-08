import type {
  MediaPrompt,
  PersistedArtifactRef,
  StreamChunk,
} from '@tanstack/ai/client'
import type { TranscriptionResponseFormat } from '@tanstack/ai'
import type { ConnectConnectionAdapter } from './connection-adapters'
import type { AIDevtoolsClientMetadata } from './devtools'
import type {
  GenerationDevtoolsBridgeFactory,
  VideoDevtoolsBridgeFactory,
} from './devtools-noop'

// ===========================
// Inference Utilities
// ===========================

/**
 * Maps an `onResult` transform's raw return type to the stored output type.
 *
 * - A concrete return (excluding null/void/undefined) becomes the output type.
 * - A return of only null/void/undefined falls back to TResult (the transform
 *   reacted to the result or chose to keep it, rather than replacing it).
 *
 * Hooks infer `TReturn` directly from the `onResult` return position — a
 * covariant inference site that works even for an optional nested property —
 * which both contextually types the callback parameter as `TResult` and
 * narrows `result`. See issue #848.
 *
 * @template TResult - The raw result type from the generation
 * @template TReturn - The transform's return type (defaults to `void` when no
 *   transform is provided)
 */
export type InferGenerationOutputFromReturn<TResult, TReturn> = [
  Exclude<TReturn, null | void | undefined>,
] extends [never]
  ? TResult
  : Exclude<TReturn, null | void | undefined>

/**
 * Infers the output type from an `onResult` callback's type.
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
  ? InferGenerationOutputFromReturn<TResult, R>
  : TResult

// ===========================
// State
// ===========================

/**
 * State machine for generation clients.
 * Simpler than ChatClientState since generation is a single request/response cycle.
 */
export type GenerationClientState = 'idle' | 'generating' | 'success' | 'error'

export type GenerationResumeStatus = 'idle' | 'running' | 'complete' | 'error'

export interface GenerationResumeState {
  threadId: string
  runId: string
  cursor: string
}

export type GenerationPendingArtifact = PersistedArtifactRef

export interface GenerationResultSnapshot {
  id?: string
  model?: string
  status?: string
  jobId?: string
  expiresAt?: string
  artifacts?: Array<PersistedArtifactRef>
}

export interface GenerationErrorSnapshot {
  message: string
  code?: string
}

export interface GenerationEventSnapshot {
  type: StreamChunk['type']
  name?: string
  timestamp?: number
}

export interface GenerationResumeSnapshot {
  resumeState: GenerationResumeState | null
  status: GenerationResumeStatus
  activity?: PersistedArtifactRef['source']['activity']
  pendingArtifacts?: Array<GenerationPendingArtifact>
  result?: GenerationResultSnapshot
  error?: GenerationErrorSnapshot
  lastEvent?: GenerationEventSnapshot
}

export interface GenerationServerPersistence {
  getItem: (
    id: string,
  ) =>
    | GenerationResumeSnapshot
    | null
    | undefined
    | Promise<GenerationResumeSnapshot | null | undefined>
  setItem: (id: string, value: GenerationResumeSnapshot) => void | Promise<void>
  removeItem: (id: string) => void | Promise<void>
}

export interface GenerationPersistenceOptions {
  server?: GenerationServerPersistence
}

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
  /** Persisted artifact refs for generated media */
  ARTIFACTS: 'generation:artifacts',
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
  /** Explicit persisted run/cursor metadata for direct server-function resume */
  resumeState?: GenerationResumeState
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
// eslint-disable-next-line @typescript-eslint/naming-convention -- _TInput is unused in the interface body but part of the public positional generic API (callers supply it for inference)
export interface GenerationClientOptions<_TInput, TResult, TOutput = TResult> {
  /** Unique identifier for this generation client instance */
  id?: string

  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>

  /** Metadata used to register this generation hook with TanStack AI Devtools */
  devtools?: Partial<AIDevtoolsClientMetadata>

  /**
   * Whether framework integrations should attempt to resume a persisted run on
   * mount. Low-level clients expose the flag for hooks; they do not auto-resume
   * by themselves. Defaults to `true` in framework hooks.
   */
  autoResume?: boolean

  /**
   * Initial lightweight resume snapshot restored by framework hooks. Contains
   * only cursor metadata, errors, and persisted artifact refs.
   */
  initialResumeSnapshot?: GenerationResumeSnapshot

  /**
   * Optional persistence adapters for lightweight generation resume state.
   * Generation hooks only support `server` persistence; generated media bytes
   * are never written into browser storage by this client.
   */
  persistence?: GenerationPersistenceOptions

  /**
   * Explicit run/cursor state to send on the next generation request. This is
   * only a resume input; explicit `stop()` still aborts the local connection and
   * does not model a durable server-side cancel.
   */
  resumeState?: GenerationResumeState

  /**
   * Factory that constructs the devtools bridge. Default is a no-op
   * factory; the real implementation lives in `@tanstack/ai-client/devtools`.
   */
  devtoolsBridgeFactory?: GenerationDevtoolsBridgeFactory

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
  /** @internal Called when lightweight resume snapshot changes */
  onResumeSnapshotChange?: (snapshot: GenerationResumeSnapshot) => void
}

export function updateGenerationResumeSnapshot(
  previous: GenerationResumeSnapshot | null | undefined,
  chunk: StreamChunk,
): GenerationResumeSnapshot {
  const threadId = stringField(chunk, 'threadId')
  const runId = stringField(chunk, 'runId')
  const cursor = stringField(chunk, 'cursor')
  const previousArtifacts = previous?.pendingArtifacts ?? []
  const next: GenerationResumeSnapshot = {
    resumeState: previous?.resumeState ?? null,
    status: previous?.status ?? 'idle',
    ...(previous?.activity ? { activity: previous.activity } : {}),
    ...(previousArtifacts.length > 0
      ? { pendingArtifacts: [...previousArtifacts] }
      : {}),
    ...(previous?.result ? { result: { ...previous.result } } : {}),
    ...(previous?.error ? { error: { ...previous.error } } : {}),
    lastEvent: createGenerationEventSnapshot(chunk),
  }

  if (threadId && runId && cursor) {
    next.resumeState = { threadId, runId, cursor }
    next.status = 'running'
  } else if (chunk.type === 'RUN_STARTED') {
    next.status = 'running'
  }

  if (chunk.type === 'CUSTOM') {
    if (chunk.name === GENERATION_EVENTS.ARTIFACTS) {
      const artifacts = collectArtifactRefs(chunk.value)
      if (artifacts.length > 0) {
        next.pendingArtifacts = artifacts
        next.activity = artifacts[0]?.source.activity
      }
    } else if (chunk.name === GENERATION_EVENTS.RESULT) {
      const result = createGenerationResultSnapshot(chunk.value)
      if (result) {
        next.result = result
        if (result.artifacts && result.artifacts.length > 0) {
          next.pendingArtifacts = result.artifacts
          next.activity = result.artifacts[0]?.source.activity
        }
      }
    }
  } else if (chunk.type === 'RUN_FINISHED') {
    next.resumeState = null
    next.status = 'complete'
  } else if (chunk.type === 'RUN_ERROR') {
    next.resumeState = null
    next.status = 'error'
    next.error = createGenerationErrorSnapshot(chunk)
  }

  return next
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
  /** Persisted artifact references for generated assets, when available */
  artifacts?: Array<PersistedArtifactRef>
}

/**
 * Options for the VideoGenerationClient.
 */
export interface VideoGenerationClientOptions<
  TOutput = VideoGenerateResult,
> extends Omit<
  GenerationClientOptions<VideoGenerateInput, VideoGenerateResult, TOutput>,
  'devtoolsBridgeFactory'
> {
  /**
   * Factory that constructs the video devtools bridge. Default is a no-op
   * factory; the real implementation lives in `@tanstack/ai-client/devtools`.
   */
  devtoolsBridgeFactory?: VideoDevtoolsBridgeFactory

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
  /**
   * Description of the desired image(s): plain text, or an ordered array of
   * content parts (text + image) for image-conditioned generation
   * (image-to-image, multi-reference, edit / inpaint).
   */
  prompt: MediaPrompt
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
  responseFormat?: TranscriptionResponseFormat
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
  /**
   * Description of the desired video: plain text, or an ordered array of
   * content parts (text + image) for image-conditioned generation
   * (image-to-video, start/end frames).
   */
  prompt: MediaPrompt
  /** Video size — format depends on provider (e.g., "16:9", "1280x720") */
  size?: string
  /** Video duration in seconds */
  duration?: number
  /** Model-specific options */
  modelOptions?: Record<string, any>
}

function createGenerationEventSnapshot(
  chunk: StreamChunk,
): GenerationEventSnapshot {
  const name = stringField(chunk, 'name')
  const timestamp = numberField(chunk, 'timestamp')
  return {
    type: chunk.type,
    ...(name ? { name } : {}),
    ...(timestamp !== undefined ? { timestamp } : {}),
  }
}

function createGenerationResultSnapshot(
  value: unknown,
): GenerationResultSnapshot | undefined {
  if (!isObject(value)) return undefined

  const artifacts = collectArtifactRefs(Reflect.get(value, 'artifacts'))
  const snapshot: GenerationResultSnapshot = {}
  const id = stringField(value, 'id')
  const model = stringField(value, 'model')
  const status = stringField(value, 'status')
  const jobId = stringField(value, 'jobId')
  if (id) snapshot.id = id
  if (model) snapshot.model = model
  if (status) snapshot.status = status
  if (jobId) snapshot.jobId = jobId
  const expiresAt = Reflect.get(value, 'expiresAt')
  if (typeof expiresAt === 'string') {
    snapshot.expiresAt = expiresAt
  } else if (expiresAt instanceof Date) {
    snapshot.expiresAt = expiresAt.toISOString()
  }
  if (artifacts.length > 0) {
    snapshot.artifacts = artifacts
  }

  return Object.keys(snapshot).length > 0 ? snapshot : undefined
}

function createGenerationErrorSnapshot(
  chunk: StreamChunk,
): GenerationErrorSnapshot {
  const message =
    stringField(chunk, 'message') ??
    nestedStringField(chunk, 'error', 'message') ??
    'An error occurred'
  const code = stringField(chunk, 'code')
  return {
    message,
    ...(code ? { code } : {}),
  }
}

function collectArtifactRefs(value: unknown): Array<PersistedArtifactRef> {
  if (!Array.isArray(value)) return []
  const refs: Array<PersistedArtifactRef> = []
  for (const item of value) {
    const ref = createPersistedArtifactRefSnapshot(item)
    if (ref) {
      refs.push(ref)
    }
  }
  return refs
}

function createPersistedArtifactRefSnapshot(
  value: unknown,
): PersistedArtifactRef | undefined {
  if (!isObject(value)) return undefined
  const source = Reflect.get(value, 'source')
  if (!isObject(source)) return undefined

  const role = persistedArtifactRoleField(value, 'role')
  const artifactId = stringField(value, 'artifactId')
  const threadId = stringField(value, 'threadId')
  const runId = stringField(value, 'runId')
  const name = stringField(value, 'name')
  const mimeType = stringField(value, 'mimeType')
  const size = numberField(value, 'size')
  const createdAt = stringField(value, 'createdAt')
  const activity = persistedArtifactActivityField(source, 'activity')
  const path = stringField(source, 'path')
  const provider = stringField(source, 'provider')
  const model = stringField(source, 'model')
  if (
    !role ||
    !artifactId ||
    !threadId ||
    !runId ||
    !name ||
    !mimeType ||
    size === undefined ||
    !createdAt ||
    !activity ||
    !path ||
    !provider ||
    !model
  ) {
    return undefined
  }

  const externalUrl = durableUrlField(value, 'externalUrl')
  const mediaType = persistedArtifactMediaTypeField(source, 'mediaType')
  const jobId = stringField(source, 'jobId')
  const expiresAt = stringField(source, 'expiresAt')

  return {
    role,
    artifactId,
    threadId,
    runId,
    name,
    mimeType,
    size,
    createdAt,
    ...(externalUrl ? { externalUrl } : {}),
    source: {
      activity,
      path,
      provider,
      model,
      ...(mediaType ? { mediaType } : {}),
      ...(jobId ? { jobId } : {}),
      ...(expiresAt ? { expiresAt } : {}),
    },
  }
}

function durableUrlField(value: object, key: string): string | undefined {
  const field = stringField(value, key)
  if (!field || field.length > 2048) return undefined
  try {
    const url = new URL(field)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? field
      : undefined
  } catch {
    return undefined
  }
}

function persistedArtifactRoleField(
  value: object,
  key: string,
): PersistedArtifactRef['role'] | undefined {
  const field = stringField(value, key)
  return field === 'input' || field === 'output' ? field : undefined
}

function persistedArtifactActivityField(
  value: object,
  key: string,
): PersistedArtifactRef['source']['activity'] | undefined {
  const field = stringField(value, key)
  if (field === undefined) return undefined

  switch (field) {
    case 'image':
    case 'audio':
    case 'tts':
    case 'video':
    case 'transcription':
      return field
    default:
      return undefined
  }
}

function persistedArtifactMediaTypeField(
  value: object,
  key: string,
): PersistedArtifactRef['source']['mediaType'] | undefined {
  const field = stringField(value, key)
  if (field === undefined) return undefined

  switch (field) {
    case 'image':
    case 'audio':
    case 'video':
    case 'document':
    case 'json':
      return field
    default:
      return undefined
  }
}

function nestedStringField(
  value: object,
  key: string,
  nestedKey: string,
): string | undefined {
  const nested = Reflect.get(value, key)
  return isObject(nested) ? stringField(nested, nestedKey) : undefined
}

function stringField(value: object, key: string): string | undefined {
  const field = Reflect.get(value, key)
  return typeof field === 'string' ? field : undefined
}

function numberField(value: object, key: string): number | undefined {
  const field = Reflect.get(value, key)
  return typeof field === 'number' ? field : undefined
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}
