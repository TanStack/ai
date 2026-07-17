import { VideoGenerationClient } from '@tanstack/ai-client'
import { createVideoDevtoolsBridge } from '@tanstack/ai-client/devtools'
import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
} from 'solid-js'
import type { StreamChunk } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  GenerationPendingArtifact,
  GenerationPersistenceOptions,
  GenerationResumeSnapshot,
  GenerationResumeState,
  InferGenerationOutputFromReturn,
  VideoGenerateInput,
  VideoGenerateResult,
  VideoStatusInfo,
} from '@tanstack/ai-client'
import type { PersistedArtifactRef } from '@tanstack/ai/client'
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
  /** Unique identifier for this generation instance */
  id?: string
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  /** Server-side lightweight generation state persistence. */
  persistence?: GenerationPersistenceOptions
  /** Initial lightweight resume snapshot restored by the app (read-only state). */
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
  /** Lightweight generation resume snapshot, if one is available */
  resumeSnapshot: Accessor<GenerationResumeSnapshot | undefined>
  /** Observed run/cursor metadata from the snapshot (read-only state) */
  resumeState: Accessor<GenerationResumeState | null>
  /** Pending persisted artifact references observed during generation/replay */
  pendingArtifacts: Accessor<Array<GenerationPendingArtifact>>
  /** Final persisted artifact references observed from a replayed result */
  resultArtifacts: Accessor<Array<PersistedArtifactRef>>
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
// `TTransformed` infers from the `onResult` return position so the callback
// parameter is typed as `VideoGenerateResult` and `result` narrows to the
// transform's return. See issue #848.
export function useGenerateVideo<TTransformed = void>(
  options: Omit<UseGenerateVideoOptions, 'onResult'> & {
    onResult?: (result: VideoGenerateResult) => TTransformed
  },
): UseGenerateVideoReturn<
  InferGenerationOutputFromReturn<VideoGenerateResult, TTransformed>
> {
  type TOutput = InferGenerationOutputFromReturn<
    VideoGenerateResult,
    TTransformed
  >
  const hookId = createUniqueId()
  const clientId = options.id || hookId

  const [result, setResult] = createSignal<TOutput | null>(null)
  const [jobId, setJobId] = createSignal<string | null>(null)
  const [videoStatus, setVideoStatus] = createSignal<VideoStatusInfo | null>(
    null,
  )
  const [isLoading, setIsLoading] = createSignal(false)
  const [error, setError] = createSignal<Error | undefined>(undefined)
  const [status, setStatus] = createSignal<GenerationClientState>('idle')
  const [resumeSnapshot, setResumeSnapshot] = createSignal<
    GenerationResumeSnapshot | undefined
  >(options.initialResumeSnapshot)
  let disposed = false

  const client = createMemo(() => {
    // Conditional spread on `body`: VideoGenerationClientOptions.body
    // is a strict optional; EOPT forbids passing `T | undefined`.
    const baseOptions = {
      id: clientId,
      body: options.body,
      ...(options.persistence !== undefined && {
        persistence: options.persistence,
      }),
      ...(options.initialResumeSnapshot !== undefined && {
        initialResumeSnapshot: options.initialResumeSnapshot,
      }),
      devtoolsBridgeFactory: createVideoDevtoolsBridge,
      devtools: {
        ...options.devtools,
        framework: 'solid',
        hookName: 'useGenerateVideo',
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
      onResumeSnapshotChange: (
        snapshot: GenerationResumeSnapshot | undefined,
      ) => {
        if (!disposed) setResumeSnapshot(snapshot)
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
  }, [clientId])

  // Sync body changes without recreating client
  createEffect(() => {
    const currentBody = options.body
    client().updateOptions({
      ...(currentBody !== undefined && { body: currentBody }),
    })
  })

  // Mount devtools only. Generation runs are never auto-started on mount —
  // persisted state is read-only for display.
  onMount(() => {
    client().mountDevtools()
  })

  // Cleanup on unmount: stop any in-flight requests and unregister devtools
  onCleanup(() => {
    disposed = true
    client().dispose()
  })

  const generate = async (input: VideoGenerateInput) => {
    await client().generate(input)
  }

  const stop = () => {
    client().stop()
  }

  const reset = () => {
    client().reset()
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
    resumeSnapshot,
    resumeState: () => resumeSnapshot()?.resumeState ?? null,
    pendingArtifacts: () => resumeSnapshot()?.pendingArtifacts ?? [],
    resultArtifacts: () => resumeSnapshot()?.result?.artifacts ?? [],
  }
}
