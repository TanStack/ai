import { VideoGenerationClient } from '@tanstack/ai-client'
import { createVideoDevtoolsBridge } from '@tanstack/ai-client/devtools'
import type { StreamChunk } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  GenerationPersistence,
  GenerationPersistenceOptions,
  GenerationResumeSnapshot,
  GenerationResumeState,
  InferGenerationOutputFromReturn,
  VideoGenerateInput,
  VideoGenerateResult,
  VideoStatusInfo,
} from '@tanstack/ai-client'

/**
 * Options for the createGenerateVideo function.
 *
 * @template TOutput - The output type after optional transform (defaults to VideoGenerateResult)
 */
export interface CreateGenerateVideoOptions<TOutput = VideoGenerateResult> {
  /** Connect-based adapter for streaming transport (server handles polling) */
  connection?: ConnectConnectionAdapter
  /** Direct async function that returns a completed video result */
  fetcher?: GenerationFetcher<VideoGenerateInput, VideoGenerateResult>
  /** Unique identifier for this generation instance */
  id?: string
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  /**
   * How this generation persists across reloads.
   * - Omit / `false`: ephemeral, in-memory only.
   * - `true`: server-driven — on mount the client hydrates the last generation
   *   for its `threadId` from the server (needs a connection with a
   *   `hydrateGeneration` handler) and repaints it; it never auto-starts a run.
   * - a storage adapter: client-driven — the lightweight snapshot is cached under
   *   `generation:<threadId>` as a run streams and read back on mount. Media bytes are
   *   never stored.
   */
  persistence?: boolean | GenerationPersistence
  /**
   * The **scope** this generation belongs to: a stable, app-chosen name for the
   * slot successive runs fill — not a link to a chat conversation.
   *
   * The hook starts empty and produces many runs over its life; each gets its
   * own `runId`, but all belong to one scope. Persistence keys on this in both
   * modes, so derive it from your own domain and keep it identical across
   * reloads (e.g. `` `video-${videoId}-start-frame` ``). It is also sent as the
   * AG-UI thread id on the wire, which the protocol requires.
   *
   * **Required whenever `persistence` is set** — an app that cannot name the
   * scope has nothing to restore to. Optional for ephemeral generations, where
   * it falls back to `id` purely to satisfy the wire.
   */
  threadId?: string
  /** Explicit resume-snapshot seed for apps that manage storage themselves; skips automatic hydration from `persistence`. Later run events merge into it. */
  initialResumeSnapshot?: GenerationResumeSnapshot
  /**
   * Server-driven hydration handler for `persistence: true` when the
   * connection doesn't carry one (e.g. alongside `fetcher`, or a `stream()` /
   * `rpcStream()` adapter built without handlers) — typically a one-line
   * server-function call. The connection's own handler takes precedence.
   */
  hydrateGeneration?: ConnectConnectionAdapter['hydrateGeneration']
  /**
   * Re-attach handler that replays a run still generating to completion on
   * mount, when the connection doesn't carry one. Without it, a restored
   * `running` snapshot surfaces as an (interrupted) error. The connection's
   * own handler takes precedence.
   */
  joinRun?: ConnectConnectionAdapter['joinRun']
  /**
   * Callback when video generation completes. Can optionally return a transformed value.
   *
   * - Return a non-null value to transform and store it as the result
   * - Return `null` to keep the previous result unchanged
   * - Return nothing (`void`) to store the raw result as-is
   */
  onResult?: (result: VideoGenerateResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback when a video job is created */
  onJobCreated?: (jobId: string) => void
  /** Callback on each status update */
  onStatusUpdate?: (status: VideoStatusInfo) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

/**
 * Return type for the createGenerateVideo function.
 *
 * @template TOutput - The output type (after optional transform)
 */
export interface CreateGenerateVideoReturn<TOutput = VideoGenerateResult> {
  /** The final video result (with URL), or null */
  readonly result: TOutput | null
  /** The current job ID, or null */
  readonly jobId: string | null
  /** Current video generation status info, or null */
  readonly videoStatus: VideoStatusInfo | null
  /** Whether generation/polling is in progress */
  readonly isLoading: boolean
  /** Current error, if any */
  readonly error: Error | undefined
  /** Current state of the generation */
  readonly status: GenerationClientState
  /** Trigger video generation */
  generate: (input: VideoGenerateInput) => Promise<void>
  /** Abort the current generation/polling */
  stop: () => void
  /** Clear all state and return to idle */
  reset: () => void
  /** Stop in-flight work and unregister devtools listeners */
  dispose: () => void
  /** Update additional body parameters */
  updateBody: (body: Record<string, any>) => void
  /**
   * The id of the generation job currently running, or `null` when nothing is in
   * flight. Each call to `generate` is one job with its own id. Pass it to your
   * own endpoint to cancel or poll the provider job — `stop()` only aborts the
   * local stream, it does not stop work already running on the provider.
   */
  readonly runId: string | null
}

/**
 * Creates a reactive video generation instance for Svelte 5.
 *
 * Video generation is asynchronous: a job is created, then polled for status
 * until completion. This function handles the full lifecycle.
 *
 * @example
 * ```svelte
 * <script>
 *   import { createGenerateVideo, fetchServerSentEvents } from '@tanstack/ai-svelte'
 *
 *   const video = createGenerateVideo({
 *     connection: fetchServerSentEvents('/api/generate/video'),
 *     onStatusUpdate: (status) => console.log(`Progress: ${status.progress}%`),
 *   })
 * </script>
 *
 * <div>
 *   <button onclick={() => video.generate({ prompt: 'A flying car over a city' })}>
 *     Generate Video
 *   </button>
 *   {#if video.isLoading && video.videoStatus}
 *     <p>Status: {video.videoStatus.status} ({video.videoStatus.progress}%)</p>
 *   {/if}
 *   {#if video.result}
 *     <video src={video.result.url} controls></video>
 *   {/if}
 * </div>
 * ```
 */
// `TTransformed` infers from the `onResult` return position so the callback
// parameter is typed as `VideoGenerateResult` and `result` narrows to the
// transform's return. See issue #848.
export function createGenerateVideo<TTransformed = void>(
  options: Omit<
    CreateGenerateVideoOptions,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: VideoGenerateResult) => TTransformed
  } & GenerationPersistenceOptions,
): CreateGenerateVideoReturn<
  InferGenerationOutputFromReturn<VideoGenerateResult, TTransformed>
> {
  type TOutput = InferGenerationOutputFromReturn<
    VideoGenerateResult,
    TTransformed
  >
  const clientId =
    options.id ||
    `video-${Date.now()}-${Math.random().toString(36).substring(7)}`

  // Create reactive state using Svelte 5 runes
  let result = $state<TOutput | null>(null)
  let jobId = $state<string | null>(null)
  let videoStatus = $state<VideoStatusInfo | null>(null)
  let isLoading = $state(false)
  let error = $state<Error | undefined>(undefined)
  let status = $state<GenerationClientState>('idle')
  let runId = $state<string | null>(
    options.initialResumeSnapshot?.resumeState?.runId ?? null,
  )
  let disposed = false

  // `body` uses a conditional spread because `VideoGenerationClientOptions.body`
  // is declared `body?: Record<string, any>` (absent vs. present) under
  // `exactOptionalPropertyTypes`. The optional caller `options.body` may be
  // undefined, in which case we want the key to be absent on the target.
  const baseOptions = {
    id: clientId,
    body: options.body,
    ...(options.persistence !== undefined && {
      persistence: options.persistence,
    }),
    ...(options.threadId !== undefined && { threadId: options.threadId }),
    ...(options.initialResumeSnapshot !== undefined && {
      initialResumeSnapshot: options.initialResumeSnapshot,
    }),
    ...(options.hydrateGeneration !== undefined && {
      hydrateGeneration: options.hydrateGeneration,
    }),
    ...(options.joinRun !== undefined && { joinRun: options.joinRun }),
    devtoolsBridgeFactory: createVideoDevtoolsBridge,
    devtools: {
      ...options.devtools,
      framework: 'svelte',
      hookName: 'createGenerateVideo',
      outputKind: 'video' as const,
    },
    // The transform's raw return type (`TTransformed`) and the stored output
    // (`TOutput`, with null/void/undefined stripped) are identical at runtime;
    // the cast bridges the relationship that the conditional type hides.
    onResult: ((r: VideoGenerateResult) => options.onResult?.(r)) as (
      result: VideoGenerateResult,
    ) => TOutput | null | void,
    onError: (e: Error) => {
      if (!disposed) options.onError?.(e)
    },
    onProgress: (p: number, m?: string) => {
      if (!disposed) options.onProgress?.(p, m)
    },
    onChunk: (c: StreamChunk) => {
      if (!disposed) options.onChunk?.(c)
    },
    onJobCreated: (id: string) => {
      if (!disposed) options.onJobCreated?.(id)
    },
    onStatusUpdate: (s: VideoStatusInfo) => {
      if (!disposed) options.onStatusUpdate?.(s)
    },
    onResultChange: (r: TOutput | null) => {
      if (disposed) return
      result = r
    },
    onLoadingChange: (l: boolean) => {
      if (disposed) return
      isLoading = l
    },
    onErrorChange: (e: Error | undefined) => {
      if (disposed) return
      error = e
    },
    onStatusChange: (s: GenerationClientState) => {
      if (disposed) return
      status = s
    },
    onJobIdChange: (id: string | null) => {
      if (disposed) return
      jobId = id
    },
    onVideoStatusChange: (s: VideoStatusInfo | null) => {
      if (disposed) return
      videoStatus = s
    },
    onResumeStateChange: (rs: GenerationResumeState | null) => {
      if (disposed) return
      runId = rs?.runId ?? null
    },
  }

  let client: VideoGenerationClient<TOutput>

  if (options.connection) {
    client = new VideoGenerationClient<TOutput>({
      ...baseOptions,
      connection: options.connection,
    })
  } else if (options.fetcher) {
    client = new VideoGenerationClient<TOutput>({
      ...baseOptions,
      fetcher: options.fetcher,
    })
  } else {
    throw new Error(
      'createGenerateVideo requires either a connection or fetcher option',
    )
  }

  // Mount devtools only. Generation runs are never auto-started on setup —
  // persisted state is read-only for display.
  client.mountDevtools()

  // Note: Cleanup is handled by calling dispose() directly when needed.
  // Unlike React/Vue/Solid, Svelte 5 runes like $effect can only be used
  // during component initialization, so we don't add automatic cleanup here.
  // Users should call video.dispose() in their component's cleanup if needed.

  const generate = async (input: VideoGenerateInput) => {
    // Svelte has no remount effect to revive a disposed client (the other
    // frameworks revive via mountDevtools() in their mount effects), so an
    // explicit generate() after dispose() is the Svelte revive path: bring
    // the client and the reactive bindings back together.
    disposed = false
    client.mountDevtools()
    await client.generate(input)
  }

  const stop = () => {
    client.stop()
  }

  const reset = () => {
    client.reset()
  }

  const dispose = () => {
    disposed = true
    client.dispose()
  }

  const updateBody = (newBody: Record<string, any>) => {
    client.updateOptions({ body: newBody })
  }

  return {
    get result() {
      return result
    },
    get jobId() {
      return jobId
    },
    get videoStatus() {
      return videoStatus
    },
    get isLoading() {
      return isLoading
    },
    get error() {
      return error
    },
    get status() {
      return status
    },
    generate,
    stop,
    reset,
    dispose,
    updateBody,
    get runId() {
      return runId
    },
  }
}
