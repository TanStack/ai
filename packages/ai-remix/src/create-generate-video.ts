import { VideoGenerationClient } from '@tanstack/ai-client'
import { createVideoDevtoolsBridge } from '@tanstack/ai-client/devtools'
import type { Handle } from 'remix/ui'
import type { StreamChunk } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  GenerationPersistenceOptions,
  InferGenerationOutputFromReturn,
  VideoGenerateInput,
  VideoGenerateResult,
  VideoGenerationClientOptions,
  VideoStatusInfo,
} from '@tanstack/ai-client'
import type { ByokClient } from '@tanstack/ai-client/byok'
import type { ProviderId } from '@tanstack/ai/byok'

/**
 * Options for the createGenerateVideo helper.
 *
 * Handle is the first argument of the helper. It is not part of this type.
 *
 * @template TOutput - The output type after optional transform (defaults to VideoGenerateResult)
 */
export interface CreateGenerateVideoOptions<TOutput = VideoGenerateResult> {
  /** Connect-based adapter for streaming transport (server handles polling) */
  connection?: ConnectConnectionAdapter
  /** Direct async function that returns a completed video result */
  fetcher?: GenerationFetcher<VideoGenerateInput, VideoGenerateResult>
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
  /** Optional BYOK keyring. Keys go in `x-byok-*` headers, never the body. */
  byok?: ByokClient
  /** Optional provider id. If it returns a slug, only that key is sent. If no slug resolves (`byokProvider`, then `body.provider`), generate throws. */
  byokProvider?: () => ProviderId | undefined
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  /**
   * How this generation persists across reloads.
   * - Omit / `false`: ephemeral, in-memory only.
   * - `true`: server-driven — on mount the client hydrates the last generation
   *   for its `threadId` from the server (needs a connection with a
   *   `hydrateGeneration` handler) and repaints it; it never auto-starts a run.
   */
  persistence?: boolean
  /**
   * The **scope** this generation belongs to: a stable, app-chosen name for the
   * slot successive runs fill — not a link to a chat conversation.
   *
   * The helper starts empty and produces many runs over its life; each gets its
   * own `runId`, but all belong to one scope. Persistence keys on this, so
   * derive it from your own domain and keep it identical across reloads (e.g.
   * `` `video-${videoId}-start-frame` ``). It is also sent as the AG-UI thread
   * id on the wire, which the protocol requires.
   *
   * **Required whenever `persistence` is set** — an app that cannot name the
   * scope has nothing to restore to. Optional for ephemeral generations. If
   * omitted, the helper uses `handle.id`.
   */
  threadId?: string
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
 * Return type for the createGenerateVideo helper.
 *
 * Fields are getters over local lets. Remix re-renders read the latest values
 * after `handle.update()`.
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
  /**
   * The id of the generation job currently running, or `null` when nothing is in
   * flight. Each call to `generate` is one job with its own id. Pass it to your
   * own endpoint to cancel or poll the provider job — `stop()` only aborts the
   * local stream, it does not stop work already running on the provider.
   */
  readonly runId: string | null
}

/**
 * Creates a video generation helper for Remix setup.
 *
 * Video generation is asynchronous: a job is created, then polled for status
 * until completion. This helper handles the full lifecycle.
 *
 * Call this in a Remix component setup function. Pass the component Handle as
 * the first argument.
 *
 * @example
 * ```tsx
 * import { createGenerateVideo } from '@tanstack/ai-remix'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 * import type { Handle } from 'remix/ui'
 *
 * function VideoGenerator(handle: Handle) {
 *   const video = createGenerateVideo(handle, {
 *     connection: fetchServerSentEvents('/api/generate/video'),
 *     onStatusUpdate: (status) => console.log(`Progress: ${status.progress}%`),
 *   })
 *
 *   return () => (
 *     <div>
 *       <button onClick={() => video.generate({ prompt: 'A flying car over a city' })}>
 *         Generate Video
 *       </button>
 *       {video.isLoading && video.videoStatus ? (
 *         <p>
 *           Status: {video.videoStatus.status} ({video.videoStatus.progress}%)
 *         </p>
 *       ) : null}
 *       {video.result ? <video src={video.result.url} controls /> : null}
 *     </div>
 *   )
 * }
 * ```
 */
// `TTransformed` infers from the `onResult` return position so the callback
// parameter is typed as `VideoGenerateResult` and `result` narrows to the
// transform's return. See issue #848.
export function createGenerateVideo<TTransformed = void>(
  handle: Pick<Handle, 'id' | 'update' | 'signal'>,
  options: Omit<
    CreateGenerateVideoOptions,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: VideoGenerateResult) => TTransformed
  } & GenerationPersistenceOptions,
) {
  type TOutput = InferGenerationOutputFromReturn<
    VideoGenerateResult,
    TTransformed
  >

  let result: TOutput | null = null
  let jobId: string | null = null
  let videoStatus: VideoStatusInfo | null = null
  let isLoading = false
  let error: Error | undefined = undefined
  let status: GenerationClientState = 'idle'
  let runId: string | null = null
  let disposed = false

  const notify = () => {
    if (disposed) return
    void handle.update()
  }

  const threadId = options.threadId ?? handle.id

  const baseOptions: Omit<
    VideoGenerationClientOptions<TOutput>,
    'persistence' | 'threadId'
  > = {
    ...(options.body !== undefined && { body: options.body }),
    ...(options.hydrateGeneration !== undefined && {
      hydrateGeneration: options.hydrateGeneration,
    }),
    ...(options.joinRun !== undefined && { joinRun: options.joinRun }),
    ...(options.byok !== undefined && { byok: options.byok }),
    byokProvider: () => options.byokProvider?.(),
    devtoolsBridgeFactory: createVideoDevtoolsBridge,
    devtools: {
      hookName: 'createGenerateVideo',
      ...options.devtools,
      framework: 'remix',
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
      notify()
    },
    onLoadingChange: (l: boolean) => {
      if (disposed) return
      isLoading = l
      notify()
    },
    onErrorChange: (e: Error | undefined) => {
      if (disposed) return
      error = e
      notify()
    },
    onStatusChange: (s: GenerationClientState) => {
      if (disposed) return
      status = s
      notify()
    },
    onJobIdChange: (id: string | null) => {
      if (disposed) return
      jobId = id
      notify()
    },
    onVideoStatusChange: (s: VideoStatusInfo | null) => {
      if (disposed) return
      videoStatus = s
      notify()
    },
    onResumeStateChange: (rs: { runId: string } | null) => {
      if (disposed) return
      runId = rs?.runId ?? null
      notify()
    },
  }

  const persistenceProps =
    typeof options.threadId === 'string' && options.persistence
      ? {
          persistence: options.persistence,
          threadId: options.threadId,
        }
      : {
          threadId,
        }

  let client: VideoGenerationClient<TOutput>
  if (options.connection) {
    client = new VideoGenerationClient<TOutput>({
      ...baseOptions,
      ...persistenceProps,
      connection: options.connection,
    })
  } else if (options.fetcher) {
    client = new VideoGenerationClient<TOutput>({
      ...baseOptions,
      ...persistenceProps,
      fetcher: options.fetcher,
    })
  } else {
    throw new Error(
      'createGenerateVideo requires either a connection or fetcher option',
    )
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    client.dispose()
  }

  if (handle.signal.aborted) {
    dispose()
  } else {
    client.mountDevtools()
    handle.signal.addEventListener('abort', dispose, { once: true })
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
    generate: (input: VideoGenerateInput) => client.generate(input),
    stop: () => client.stop(),
    reset: () => client.reset(),
    get runId() {
      return runId
    },
  }
}
