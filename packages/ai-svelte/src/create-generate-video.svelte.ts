import { VideoGenerationClient } from '@tanstack/ai-client'
import { createVideoDevtoolsBridge } from '@tanstack/ai-client/devtools'
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
  VideoStatusInfo,
} from '@tanstack/ai-client'
import type { ByokClient } from '@tanstack/ai-client/byok'
import type { ProviderId } from '@tanstack/ai/byok'

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
   * The hook starts empty and produces many runs over its life; each gets its
   * own `runId`, but all belong to one scope. Persistence keys on this, so
   * derive it from your own domain and keep it identical across reloads (e.g.
   * `` `video-${videoId}-start-frame` ``). It is also sent as the AG-UI thread
   * id on the wire, which the protocol requires.
   *
   * **Required whenever `persistence` is set** — an app that cannot name the
   * scope has nothing to restore to. Optional for ephemeral generations. If
   * omitted, the client mints a wire id after mount.
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

  // Create reactive state using Svelte 5 runes
  /** The final video result (with URL), or null */
  let result = $state<TOutput | null>(null)
  /** The current job ID, or null */
  let jobId = $state<string | null>(null)
  /** Current video generation status info, or null */
  let videoStatus = $state<VideoStatusInfo | null>(null)
  /** Whether generation/polling is in progress */
  let isLoading = $state(false)
  /** Current error, if any */
  let error = $state<Error | undefined>(undefined)
  /** Current state of the generation */
  let status = $state<GenerationClientState>('idle')
  let runId = $state<string | null>(null)
  let disposed = false

  const baseOptions = {
    body: options.body,
    ...(typeof options.threadId === 'string' && options.persistence
      ? {
          persistence: options.persistence,
          threadId: options.threadId,
        }
      : {
          ...(options.threadId !== undefined && {
            threadId: options.threadId,
          }),
        }),
    ...(options.hydrateGeneration !== undefined && {
      hydrateGeneration: options.hydrateGeneration,
    }),
    ...(options.joinRun !== undefined && { joinRun: options.joinRun }),
    ...(options.byok !== undefined && { byok: options.byok }),
    byokProvider: () => options.byokProvider?.(),
    devtoolsBridgeFactory: createVideoDevtoolsBridge,
    devtools: {
      ...options.devtools,
      framework: 'svelte',
      hookName: 'createGenerateVideo',
      outputKind: 'video' as const,
    },
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
    onResumeStateChange: (rs: { runId: string } | null) => {
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

  /** Trigger video generation */
  const generate = async (input: VideoGenerateInput) => {
    disposed = false
    client.mountDevtools()
    await client.generate(input)
  }

  /** Abort the current generation/polling */
  const stop = () => {
    client.stop()
  }

  /** Clear all state and return to idle */
  const reset = () => {
    client.reset()
  }

  /** Stop in-flight work and unregister devtools listeners */
  const dispose = () => {
    disposed = true
    client.dispose()
  }

  /** Update additional body parameters */
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
