import { VideoGenerationClient } from '@tanstack/ai-client'
import { createVideoDevtoolsBridge } from '@tanstack/ai-client/devtools'
import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  untrack,
} from 'solid-js'
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
import type { Accessor } from 'solid-js'

/**
 * Options for the useGenerateVideo hook.
 *
 * @template TOutput - The transformed output type (defaults to VideoGenerateResult)
 */
export interface UseGenerateVideoOptions<TOutput = VideoGenerateResult> {
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
 * Return type for the useGenerateVideo hook.
 *
 * @template TOutput - The transformed output type (defaults to VideoGenerateResult)
 */
export interface UseGenerateVideoReturn<TOutput = VideoGenerateResult> {
  /** Trigger video generation */
  generate: (input: VideoGenerateInput) => Promise<void>
  /** The final video result (with URL), or null */
  result: Accessor<TOutput | null>
  /** The current job ID, or null */
  jobId: Accessor<string | null>
  /** Current video generation status info, or null */
  videoStatus: Accessor<VideoStatusInfo | null>
  /** Whether generation/polling is in progress */
  isLoading: Accessor<boolean>
  /** Current error, if any */
  error: Accessor<Error | undefined>
  /** Current state of the generation */
  status: Accessor<GenerationClientState>
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
  runId: Accessor<string | null>
}

/**
 * Solid hook for generating videos using AI models.
 *
 * Video generation is asynchronous: a job is created, then polled for status
 * until completion. This hook handles the full lifecycle.
 *
 * @example
 * ```tsx
 * import { useGenerateVideo } from '@tanstack/ai-solid'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 *
 * function VideoGenerator() {
 *   const { generate, result, videoStatus, isLoading } = useGenerateVideo({
 *     connection: fetchServerSentEvents('/api/generate/video'),
 *     onStatusUpdate: (status) => console.log(`Progress: ${status.progress}%`),
 *   })
 *
 *   return (
 *     <div>
 *       <button onClick={() => generate({ prompt: 'A flying car over a city' })}>
 *         Generate Video
 *       </button>
 *       {isLoading() && videoStatus() && (
 *         <p>Status: {videoStatus()!.status} ({videoStatus()!.progress}%)</p>
 *       )}
 *       {result() && <video src={result()!.url} controls />}
 *     </div>
 *   )
 * }
 * ```
 */
export function useGenerateVideo<TTransformed = void>(
  options: Omit<
    UseGenerateVideoOptions,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: VideoGenerateResult) => TTransformed
  } & GenerationPersistenceOptions,
): UseGenerateVideoReturn<
  InferGenerationOutputFromReturn<VideoGenerateResult, TTransformed>
> {
  type TOutput = InferGenerationOutputFromReturn<
    VideoGenerateResult,
    TTransformed
  >
  const [result, setResult] = createSignal<TOutput | null>(null)
  const [jobId, setJobId] = createSignal<string | null>(null)
  const [videoStatus, setVideoStatus] = createSignal<VideoStatusInfo | null>(
    null,
  )
  const [isLoading, setIsLoading] = createSignal(false)
  const [error, setError] = createSignal<Error | undefined>(undefined)
  const [status, setStatus] = createSignal<GenerationClientState>('idle')
  const [runId, setRunId] = createSignal<string | null>(null)
  let disposed = false

  const client = untrack((): VideoGenerationClient<TOutput> => {
    // Conditional spread on `body`: VideoGenerationClientOptions.body
    // is a strict optional; EOPT forbids passing `T | undefined`.
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
        framework: 'solid',
        hookName: 'useGenerateVideo',
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
        if (!disposed) setResult(() => r)
      },
      onLoadingChange: (l: boolean) => {
        if (!disposed) setIsLoading(l)
      },
      onErrorChange: (e: Error | undefined) => {
        if (!disposed) setError(e)
      },
      onStatusChange: (s: GenerationClientState) => {
        if (!disposed) setStatus(s)
      },
      onJobIdChange: (id: string | null) => {
        if (!disposed) setJobId(id)
      },
      onVideoStatusChange: (s: VideoStatusInfo | null) => {
        if (!disposed) setVideoStatus(s)
      },
      onResumeStateChange: (rs: { runId: string } | null) => {
        if (!disposed) setRunId(rs?.runId ?? null)
      },
    }

    if (options.connection) {
      return new VideoGenerationClient<TOutput>({
        ...baseOptions,
        connection: options.connection,
      })
    }

    if (options.fetcher) {
      return new VideoGenerationClient<TOutput>({
        ...baseOptions,
        fetcher: options.fetcher,
      })
    }

    throw new Error(
      'useGenerateVideo requires either a connection or fetcher option',
    )
  })

  // Sync body changes without recreating client
  createEffect(() => {
    const currentBody = options.body
    client.updateOptions({
      ...(currentBody !== undefined && { body: currentBody }),
    })
  })

  // Mount devtools only. Generation runs are never auto-started on mount — a
  // persisted snapshot is hydrated for display, never replayed.
  onMount(() => {
    client.mountDevtools()
  })

  // Cleanup on unmount: stop any in-flight requests and unregister devtools
  onCleanup(() => {
    disposed = true
    client.dispose()
  })

  /** Trigger video generation */
  const generate = async (input: VideoGenerateInput) => {
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

  return {
    generate,
    result,
    jobId,
    videoStatus,
    isLoading,
    error,
    status,
    stop,
    reset,
    runId,
  }
}
