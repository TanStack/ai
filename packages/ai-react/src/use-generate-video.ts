import { VideoGenerationClient } from '@tanstack/ai-client'
import { createVideoDevtoolsBridge } from '@tanstack/ai-client/devtools'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
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
 * Options for the useGenerateVideo hook.
 */
export interface UseGenerateVideoOptions<TOutput = VideoGenerateResult> {
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
 * @template TOutput - The output type (after optional transform)
 */
export interface UseGenerateVideoReturn<TOutput = VideoGenerateResult> {
  /** Trigger video generation */
  generate: (input: VideoGenerateInput) => Promise<void>
  /** The final video result (with URL), or null */
  result: TOutput | null
  /** The current job ID, or null */
  jobId: string | null
  /** Current video generation status info, or null */
  videoStatus: VideoStatusInfo | null
  /** Whether generation/polling is in progress */
  isLoading: boolean
  /** Current error, if any */
  error: Error | undefined
  /** Current state of the generation */
  status: GenerationClientState
  /** Abort the current generation/polling */
  stop: () => void
  /** Clear all state and return to idle */
  reset: () => void
  /** Identity of the in-flight run while one is streaming, or null after it ends */
  resumeState: GenerationResumeState | null
}

/**
 * React hook for generating videos using AI models.
 *
 * Video generation is asynchronous: a job is created, then polled for status
 * until completion. This hook handles the full lifecycle.
 *
 * @example
 * ```tsx
 * import { useGenerateVideo } from '@tanstack/ai-react'
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
 *       {isLoading && videoStatus && (
 *         <p>Status: {videoStatus.status} ({videoStatus.progress}%)</p>
 *       )}
 *       {result && <video src={result.url} controls />}
 *     </div>
 *   )
 * }
 * ```
 */
// `TTransformed` infers from the `onResult` return position so the callback
// parameter is typed as `VideoGenerateResult` and `result` narrows to the
// transform's return. See issue #848.
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
  const hookId = useId()
  const clientId = options.id || hookId

  const [result, setResult] = useState<TOutput | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [videoStatus, setVideoStatus] = useState<VideoStatusInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | undefined>(undefined)
  const [status, setStatus] = useState<GenerationClientState>('idle')
  const [resumeState, setResumeState] = useState<GenerationResumeState | null>(
    options.initialResumeSnapshot?.resumeState ?? null,
  )

  const optionsRef = useRef(options)
  optionsRef.current = options
  const disposedRef = useRef(false)

  const client = useMemo(() => {
    const opts = optionsRef.current

    // Conditional spread for `body` (strict-optional in target).
    // Optional callbacks are wrapped in non-returning bodies so
    // `?.()`'s implicit `undefined` doesn't widen the function
    // return type (which `exactOptionalPropertyTypes` rejects
    // against the strict-optional target).
    const baseOptions = {
      id: clientId,
      body: opts.body,
      ...(opts.persistence !== undefined && { persistence: opts.persistence }),
      ...(opts.threadId !== undefined && { threadId: opts.threadId }),
      ...(opts.initialResumeSnapshot !== undefined && {
        initialResumeSnapshot: opts.initialResumeSnapshot,
      }),
      devtoolsBridgeFactory: createVideoDevtoolsBridge,
      devtools: {
        ...opts.devtools,
        framework: 'react',
        hookName: 'useGenerateVideo',
        outputKind: 'video' as const,
      },
      // The transform's raw return type (`TTransformed`) and the stored output
      // (`TOutput`, with null/void/undefined stripped) are identical at runtime;
      // the cast bridges the relationship that the conditional type hides.
      onResult: ((r: VideoGenerateResult) =>
        optionsRef.current.onResult?.(r)) as (
        result: VideoGenerateResult,
      ) => TOutput | null | void,
      onError: (e: Error) => {
        if (!disposedRef.current) optionsRef.current.onError?.(e)
      },
      onProgress: (p: number, m?: string) => {
        if (!disposedRef.current) optionsRef.current.onProgress?.(p, m)
      },
      onChunk: (c: StreamChunk) => {
        if (!disposedRef.current) optionsRef.current.onChunk?.(c)
      },
      onJobCreated: (id: string) => {
        if (!disposedRef.current) optionsRef.current.onJobCreated?.(id)
      },
      onStatusUpdate: (s: VideoStatusInfo) => {
        if (!disposedRef.current) optionsRef.current.onStatusUpdate?.(s)
      },
      onResultChange: (r: TOutput | null) => {
        if (!disposedRef.current) setResult(r)
      },
      onLoadingChange: (l: boolean) => {
        if (!disposedRef.current) setIsLoading(l)
      },
      onErrorChange: (e: Error | undefined) => {
        if (!disposedRef.current) setError(e)
      },
      onStatusChange: (s: GenerationClientState) => {
        if (!disposedRef.current) setStatus(s)
      },
      onJobIdChange: (id: string | null) => {
        if (!disposedRef.current) setJobId(id)
      },
      onVideoStatusChange: (s: VideoStatusInfo | null) => {
        if (!disposedRef.current) setVideoStatus(s)
      },
      onResumeStateChange: (rs: GenerationResumeState | null) => {
        if (!disposedRef.current) setResumeState(rs)
      },
    }

    if (opts.connection) {
      return new VideoGenerationClient<TOutput>({
        ...baseOptions,
        connection: opts.connection,
      })
    }

    if (opts.fetcher) {
      return new VideoGenerationClient<TOutput>({
        ...baseOptions,
        fetcher: opts.fetcher,
      })
    }

    throw new Error(
      'useGenerateVideo requires either a connection or fetcher option',
    )
  }, [clientId])

  // Sync body changes without recreating client
  useEffect(() => {
    // Conditional spread: target uses strict-optional `body?: T`.
    client.updateOptions({
      ...(options.body !== undefined && { body: options.body }),
    })
  }, [client, options.body])

  // Mount devtools and clean up on unmount. Generation runs are never
  // auto-started on mount — persisted state is only displayed. Mounting
  // revives the client after a StrictMode dispose → remount replay.
  useEffect(() => {
    disposedRef.current = false
    client.mountDevtools()

    return () => {
      disposedRef.current = true
      client.dispose()
    }
  }, [client])

  const generate = useCallback(
    async (input: VideoGenerateInput) => {
      await client.generate(input)
    },
    [client],
  )

  const stop = useCallback(() => {
    client.stop()
  }, [client])

  const reset = useCallback(() => {
    client.reset()
  }, [client])

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
    resumeState,
  }
}
