import type {
  MediaPrompt,
  PersistedArtifactRef,
  StreamChunk,
} from '@tanstack/ai/client'
import type { TokenUsage, TranscriptionResponseFormat } from '@tanstack/ai'
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

/**
 * Status of a persisted/restored generation run.
 *
 * `running` / `complete` / `error` are the three the server-side mapper emits
 * over the wire. `idle` is client-local only: it seeds a hand-written
 * `initialResumeSnapshot`, and `stop()` rewrites a `running` snapshot to it so
 * a cancelled run is no longer resumable.
 */
export type GenerationResumeStatus = 'idle' | 'running' | 'complete' | 'error'

/**
 * Thrown when a generation stream ends without a terminal `RUN_FINISHED` /
 * `RUN_ERROR` chunk — a proxy/load-balancer idle timeout, a server restart
 * mid-run, or a durable log whose terminal append never landed. The run's
 * outcome is unknowable from the client, so it settles as an error rather than
 * leaving the client stuck on `generating` forever.
 */
export const GENERATION_STREAM_TRUNCATED_MESSAGE =
  'The generation stream ended before the run finished (no RUN_FINISHED or RUN_ERROR was received) — the connection was interrupted. Generate again to retry.'

/**
 * Reported when a restored snapshot says the run completed but the activity's
 * `reconstructResult` mapper cannot rebuild a result from it — typically an
 * output artifact persisted without a serve `url`. Surfacing it beats a
 * `success` status with a `null` result, which no consumer can render.
 */
export const GENERATION_UNRESTORABLE_RESULT_MESSAGE =
  'The stored generation completed but its result could not be rebuilt from the persisted record (its output artifact carries no serve URL, or the fields this activity needs were not persisted). Generate again to produce a fresh result.'

/**
 * Wrap a mount-hydration failure with context. Genuine failures (transport
 * error, a 403 from the authorize gate, an unparseable body, a record the
 * client's validator rejects) must reach the app; only a genuine miss — the
 * server reporting no record for the thread — stays silent.
 */
export function createGenerationHydrationError(
  detail: string,
  cause?: unknown,
): Error {
  const suffix = cause instanceof Error ? `: ${cause.message}` : ''
  const error = new Error(
    `[TanStack AI] Restoring the last generation for this thread failed — ${detail}${suffix}`,
  )
  if (cause !== undefined) {
    error.cause = cause
  }
  return error
}

/**
 * Map a persisted resume status to the client's live state machine on restore:
 * complete → success, error → error, running → generating, idle → idle. A
 * restored `running` only reaches this mapping when a `joinRun` handler can
 * tail the run to completion; without one the client rewrites the snapshot to
 * `error` (interrupted) before repainting, so it never sticks on `generating`.
 */
export function clientStateFromResumeStatus(
  status: GenerationResumeStatus,
): GenerationClientState {
  switch (status) {
    case 'complete':
      return 'success'
    case 'error':
      return 'error'
    case 'running':
      return 'generating'
    case 'idle':
      return 'idle'
  }
}

export interface GenerationResumeState {
  threadId: string
  runId: string
  /**
   * Artifact refs observed while the run is still in flight. Non-null only while
   * a run is streaming (`resumeState` itself is null once it ends); the final
   * refs move onto `result.artifacts` when the run completes.
   */
  pendingArtifacts?: Array<PersistedArtifactRef>
}

export type GenerationPendingArtifact = PersistedArtifactRef

export interface GenerationResultSnapshot {
  id?: string
  model?: string
  status?: string
  /**
   * The provider's async job handle (e.g. a Veo/fal video job id used for
   * status polling) — NOT the generation's own `runId`, which lives on
   * {@link GenerationResumeState.runId}.
   */
  providerJobId?: string
  expiresAt?: string
  /**
   * The text output of a text activity (a transcription's `text` or a summary's
   * `summary`). Persisted so a text generation restores its result on reload
   * (text is small and not bytes). Absent for media activities, whose output
   * restores from `artifacts`.
   */
  text?: string
  /** Token usage, persisted so a text result that requires it can be rebuilt. */
  usage?: TokenUsage
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
  /**
   * Version of the persisted snapshot shape. Written on every persisted
   * snapshot so future shape changes can migrate (or reject) old records.
   * Optional so hand-written seeds don't need to set it; absent means `1`.
   */
  schemaVersion?: 1
  resumeState: GenerationResumeState | null
  status: GenerationResumeStatus
  activity?: PersistedArtifactRef['source']['activity']
  pendingArtifacts?: Array<GenerationPendingArtifact>
  result?: GenerationResultSnapshot
  error?: GenerationErrorSnapshot
  lastEvent?: GenerationEventSnapshot
}

/**
 * The `persistence` option for a generation client.
 *
 * - `false` (default) / omitted: ephemeral. Nothing is recorded; a reload starts
 *   from empty.
 * - `true`: server-driven. On mount the client hydrates the last generation for
 *   its `threadId` from the server (via a `hydrateGeneration` handler, from the
 *   connection or supplied as an option) and repaints that snapshot. It never
 *   auto-starts a run.
 *
 * The record lives on the server, written by `withGenerationPersistence`. The
 * browser caches nothing, so a generation's history is never duplicated into
 * client storage.
 */
export type GenerationPersistenceOption = boolean

/**
 * The `persistence` / `threadId` / `id` identity shared by every generation hook.
 *
 * Turning persistence on **requires** a `threadId`, the stable scope runs are
 * filed under. Without one the client would hydrate by a generated id that
 * changes every reload, so nothing would ever restore; making it a type error
 * means the compiler asks for the scope instead of the runtime inventing one.
 *
 * `threadId` is the single identity for the hook, the AG-UI wire thread, and
 * persistence. Legacy `id` is deprecated and typed `never` whenever
 * `threadId` is supplied — pass one scope, not two.
 *
 * Ephemeral generations (no `persistence`, or `persistence: false`) may still
 * pass a deprecated `id` when they have no `threadId`, as a wire/devtools
 * fallback. Prefer giving them a `threadId` instead.
 *
 * USAGE: intersect this onto a hook's parameter and subtract the three keys
 * from the options interface, leaving that interface a plain (non-union)
 * object so `Pick` / `Omit` composition elsewhere keeps working:
 *
 * ```ts
 * options: Omit<UseGenerateImageOptions, 'onResult' | 'persistence' | 'threadId' | 'id'> & {
 *   onResult?: (result: ImageGenerationResult) => TTransformed
 * } & GenerationPersistenceOptions
 * ```
 *
 * Do NOT bake the union into the options interface itself: a later plain `Omit`
 * over a union collapses it to a single object type and the requirement
 * silently disappears. `use-generation-persistence-types.test.ts` pins this.
 */
export type GenerationPersistenceOptions =
  | {
      persistence: true
      /** Required by `persistence` — the stable scope runs are filed under. */
      threadId: string
      /**
       * @deprecated Prefer `threadId`. Not allowed when `threadId` is set —
       * `threadId` is the single identity for the hook, the wire, and persistence.
       */
      id?: never
    }
  | {
      persistence?: false | undefined
      /** Stable scope for the generation slot (also the wire / devtools identity). */
      threadId: string
      /**
       * @deprecated Prefer `threadId`. Not allowed when `threadId` is set.
       */
      id?: never
    }
  | {
      persistence?: false | undefined
      threadId?: undefined
      /**
       * @deprecated Prefer `threadId` as the single identity. Only allowed when
       * `threadId` is omitted — legacy wire/devtools fallback for ephemeral runs.
       */
      id?: string
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
  /**
   * @deprecated Prefer {@link GenerationClientOptions.threadId}. Legacy instance
   * id used only as a wire/devtools fallback when `threadId` is omitted. When
   * both are passed, `threadId` wins and `id` is ignored. Framework hooks type
   * `id` as `never` whenever `threadId` is set — see
   * {@link GenerationPersistenceOptions}.
   */
  id?: string

  /**
   * The **scope** this generation belongs to: a stable, app-chosen name for the
   * slot successive runs fill, not a link to a chat conversation. This is the
   * single identity for the client — wire thread id, devtools hook id, and
   * persistence key.
   *
   * A generation hook starts empty and produces many runs over its life — each
   * run gets its own `runId`, but they all belong to one scope. Persistence
   * keys on this: server-driven hydrates the last run for it on mount. It is
   * also sent as the AG-UI thread id on the wire, since the protocol requires
   * one.
   *
   * Derive it from your own domain — it must be meaningful before any media
   * exists and identical after a reload:
   *
   * ```ts
   * threadId: `video-${videoId}-start-frame`
   * ```
   *
   * **Required whenever `persistence` is set.** An app that cannot name the
   * scope has nothing to restore *to*, and a generated fallback would key each
   * reload differently — silently restoring nothing. Optional only for
   * ephemeral runs, where it falls back to deprecated `id` (or a generated id)
   * purely to satisfy the wire and nothing is written.
   */
  threadId?: string

  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>

  /** Metadata used to register this generation hook with TanStack AI Devtools */
  devtools?: Partial<AIDevtoolsClientMetadata>

  /**
   * Explicit seed for the lightweight resume snapshot, for apps that manage
   * storage themselves. When set, automatic hydration from `persistence` is
   * skipped. It does not trigger any generation, but it is **not** inert: it
   * seeds the client's live resume snapshot, which subsequent run events merge
   * into and which `getResumeSnapshot()` returns and the client re-persists.
   * Later reads therefore reflect this seed merged with observed activity, not
   * the original value verbatim.
   */
  initialResumeSnapshot?: GenerationResumeSnapshot

  /**
   * How this generation persists across reloads. See
   * {@link GenerationPersistenceOption}.
   *
   * - Omit or `false`: ephemeral, in-memory only.
   * - `true`: server-driven. On mount the client hydrates the last generation
   *   for its `threadId` from the server (needs a `hydrateGeneration` handler,
   *   from the connection or the option below) and repaints that snapshot. It
   *   never auto-starts a run.
   */
  persistence?: GenerationPersistenceOption

  /**
   * Server-driven hydration handler, for transports that don't carry one on
   * the connection: supply it alongside `fetcher` (or a `stream()` /
   * `rpcStream()` connection built without handlers) so `persistence: true`
   * can restore the last generation for `threadId` on mount. Typically a
   * one-line TanStack Start server-function call backed by
   * `getGenerationHydration` from `@tanstack/ai-persistence`.
   *
   * A connection's own `hydrateGeneration` takes precedence when both exist.
   */
  hydrateGeneration?: ConnectConnectionAdapter['hydrateGeneration']

  /**
   * Re-attach handler for a run that is still generating, for transports that
   * don't carry one on the connection. The client tails this on mount when a
   * restored/hydrated snapshot reports a run in flight, replaying it to
   * completion in place. Without it, a restored `running` snapshot surfaces
   * as an (interrupted) error — an interrupted generation cannot be resumed,
   * only re-run.
   *
   * A connection's own `joinRun` takes precedence when both exist.
   */
  joinRun?: ConnectConnectionAdapter['joinRun']

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
  /** @internal Called when lightweight resume snapshot changes. Receives `undefined` when the snapshot is cleared by `reset()`. */
  onResumeSnapshotChange?: (
    snapshot: GenerationResumeSnapshot | undefined,
  ) => void
  /** @internal Called when the in-flight run identity changes. `null` once no run is in flight. Mirrors the chat client's resume-state callback. */
  onResumeStateChange?: (resumeState: GenerationResumeState | null) => void

  /**
   * @internal Rebuild a typed result from a restored snapshot, injected by each
   * specialized client/hook (which knows the concrete result shape). Called on
   * mount restore (client store or server hydrate) so `result` repaints as if the
   * run had just finished, with media resolved to the durable serve URL. Returns
   * `null` when the snapshot cannot rebuild a result (then `result` stays null;
   * `status` / `error` / `resumeState` still repaint).
   */
  reconstructResult?: (restored: GenerationRestoredResult) => TResult | null
}

/**
 * The restorable shape handed to a client's `reconstructResult` mapper: the
 * result metadata that survived persistence plus the durable artifact refs (each
 * carrying its serve {@link PersistedArtifactRef.url}). The specialized client
 * turns this into its own typed result (image `images`, video `url`, text
 * `text`, ...).
 */
export interface GenerationRestoredResult {
  id?: string
  model?: string
  status?: string
  /** The provider's async job handle — see {@link GenerationResultSnapshot.providerJobId}. */
  providerJobId?: string
  expiresAt?: string
  text?: string
  usage?: TokenUsage
  activity?: PersistedArtifactRef['source']['activity']
  artifacts: Array<PersistedArtifactRef>
}

/**
 * Reduces one observed stream chunk into the lightweight resume snapshot.
 *
 * A `RUN_STARTED` chunk begins a fresh run, so stale `result` / `error` /
 * `pendingArtifacts` from a previous run are dropped rather than carried into
 * the new run's snapshot.
 */
export function updateGenerationResumeSnapshot(
  previous: GenerationResumeSnapshot | null | undefined,
  chunk: StreamChunk,
): GenerationResumeSnapshot {
  const threadId = stringField(chunk, 'threadId')
  const runId = stringField(chunk, 'runId')
  const carried = chunk.type === 'RUN_STARTED' ? undefined : previous
  const previousArtifacts = carried?.pendingArtifacts ?? []
  const next: GenerationResumeSnapshot = {
    schemaVersion: 1,
    resumeState: carried?.resumeState ?? null,
    status: carried?.status ?? 'idle',
    ...(carried?.activity ? { activity: carried.activity } : {}),
    ...(previousArtifacts.length > 0
      ? { pendingArtifacts: [...previousArtifacts] }
      : {}),
    ...(carried?.result ? { result: { ...carried.result } } : {}),
    ...(carried?.error ? { error: { ...carried.error } } : {}),
    lastEvent: createGenerationEventSnapshot(chunk),
  }

  if (threadId && runId) {
    next.resumeState = { threadId, runId }
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
    } else if (chunk.name === GENERATION_EVENTS.VIDEO_JOB_CREATED) {
      // Capture the provider job id as soon as the job exists — for a long
      // video run this is the one piece of identity worth having after a
      // reload, and the terminal `generation:result` may never arrive.
      const providerJobId = isObject(chunk.value)
        ? stringField(chunk.value, 'jobId')
        : undefined
      if (providerJobId) {
        next.result = { ...next.result, providerJobId }
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

/**
 * Validates an untrusted value (typically read back from a storage adapter)
 * into a {@link GenerationResumeSnapshot}, or returns `undefined` when the
 * value is not a usable snapshot.
 *
 * Storage contents are outside the type system — they may be stale, truncated,
 * hand-edited, or written by a future version. Every field is re-validated
 * with the same narrowing the live chunk reducer uses. `lastEvent` is not
 * restored: it describes a transient stream position that has no meaning
 * after a reload.
 */
export function parseGenerationResumeSnapshot(
  value: unknown,
): GenerationResumeSnapshot | undefined {
  if (!isObject(value)) return undefined

  const schemaVersion = Reflect.get(value, 'schemaVersion')
  if (schemaVersion !== undefined && schemaVersion !== 1) return undefined

  const status = generationResumeStatusField(value, 'status')
  if (!status) return undefined

  const rawResumeState = Reflect.get(value, 'resumeState')
  let resumeState: GenerationResumeState | null = null
  if (rawResumeState !== null && rawResumeState !== undefined) {
    if (!isObject(rawResumeState)) return undefined
    const threadId = stringField(rawResumeState, 'threadId')
    const runId = stringField(rawResumeState, 'runId')
    if (!threadId || !runId) return undefined
    resumeState = { threadId, runId }
  }

  const snapshot: GenerationResumeSnapshot = {
    schemaVersion: 1,
    resumeState,
    status,
  }

  const activity = persistedArtifactActivityField(value, 'activity')
  if (activity) snapshot.activity = activity

  const pendingArtifacts = collectArtifactRefs(
    Reflect.get(value, 'pendingArtifacts'),
  )
  if (pendingArtifacts.length > 0) snapshot.pendingArtifacts = pendingArtifacts

  const result = createGenerationResultSnapshot(Reflect.get(value, 'result'))
  if (result) snapshot.result = result

  const rawError = Reflect.get(value, 'error')
  if (isObject(rawError)) {
    const message = stringField(rawError, 'message')
    if (message) {
      const code = stringField(rawError, 'code')
      snapshot.error = { message, ...(code ? { code } : {}) }
    }
  }

  return snapshot
}

function generationResumeStatusField(
  value: object,
  key: string,
): GenerationResumeStatus | undefined {
  const field = stringField(value, key)
  if (field === undefined) return undefined

  switch (field) {
    case 'idle':
    case 'running':
    case 'complete':
    case 'error':
      return field
    default:
      return undefined
  }
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

/** @internal Narrows an untrusted result payload into the persisted result snapshot shape. */
export function createGenerationResultSnapshot(
  value: unknown,
): GenerationResultSnapshot | undefined {
  if (!isObject(value)) return undefined

  const artifacts = collectArtifactRefs(Reflect.get(value, 'artifacts'))
  const snapshot: GenerationResultSnapshot = {}
  const id = stringField(value, 'id')
  const model = stringField(value, 'model')
  const status = stringField(value, 'status')
  // A live provider result carries its job handle as `jobId` (e.g.
  // `VideoGenerateResult.jobId`); a persisted snapshot carries it as
  // `providerJobId`. Accept both — this narrows raw results AND stored
  // snapshots.
  const providerJobId =
    stringField(value, 'providerJobId') ?? stringField(value, 'jobId')
  // A transcription's output is `text`; a summary's is `summary`. Capture either
  // under `text` so a text result restores on reload.
  const text = stringField(value, 'text') ?? stringField(value, 'summary')
  const usage = Reflect.get(value, 'usage')
  if (id) snapshot.id = id
  if (model) snapshot.model = model
  if (status) snapshot.status = status
  if (providerJobId) snapshot.providerJobId = providerJobId
  if (text) snapshot.text = text
  // Passthrough opaque token-usage metadata (untrusted; not deeply validated).
  if (isObject(usage)) snapshot.usage = usage as TokenUsage
  const expiresAt = Reflect.get(value, 'expiresAt')
  if (typeof expiresAt === 'string') {
    snapshot.expiresAt = expiresAt
  } else if (expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime())) {
    // `toISOString()` throws on an invalid Date. This runs per chunk on live
    // provider values, so drop an unusable date like every other bad field
    // here rather than throwing out of the stream loop.
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

  const sourceUrl = durableUrlField(value, 'sourceUrl')
  const url = serveUrlField(value, 'url')
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
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(url ? { url } : {}),
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

/**
 * Validates an app-origin serve URL, which unlike a provider URL is usually a
 * same-origin path (`/api/.../artifact?id=...`). Accepts an absolute http(s) URL
 * or a path-absolute same-origin URL (single leading `/`); rejects
 * protocol-relative (`//host`), `javascript:` / `data:`, and anything else, since
 * this value is rendered as media `src`.
 */
function serveUrlField(value: object, key: string): string | undefined {
  const field = stringField(value, key)
  if (!field || field.length > 2048) return undefined
  // A single leading `/` is a safe same-origin path. Reject protocol-relative
  // `//host` AND a backslash bypass (`/\host` — the URL parser treats `\` as `/`
  // for http(s), so it would resolve to a foreign origin as an `<img src>`).
  if (field.startsWith('/') && !field.startsWith('//') && !field.includes('\\'))
    return field
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
