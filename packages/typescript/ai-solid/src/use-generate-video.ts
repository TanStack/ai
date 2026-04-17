import { VideoGenerationClient } from '@tanstack/ai-client'
import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
} from 'solid-js'
import type { StreamChunk } from '@tanstack/ai'
import type {
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutput,
  VideoGenerateInput,
  VideoGenerateResult,
  VideoStatusInfo,
} from '@tanstack/ai-client'
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
export function useGenerateVideo<
  TOnResult extends ((result: VideoGenerateResult) => any) | undefined =
    undefined,
>(
  options: Omit<UseGenerateVideoOptions, 'onResult'> & {
    onResult?: TOnResult
  },
): UseGenerateVideoReturn<
  InferGenerationOutput<VideoGenerateResult, TOnResult>
> {
  type TOutput = InferGenerationOutput<VideoGenerateResult, TOnResult>
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

  const client = createMemo(() => {
    const baseOptions = {
      id: clientId,
      body: options.body,
      onResult: (r: VideoGenerateResult) => options.onResult?.(r),
      onError: (e: Error) => options.onError?.(e),
      onProgress: (p: number, m?: string) => options.onProgress?.(p, m),
      onChunk: (c: StreamChunk) => options.onChunk?.(c),
      onJobCreated: (id: string) => options.onJobCreated?.(id),
      onStatusUpdate: (s: VideoStatusInfo) => options.onStatusUpdate?.(s),
      onResultChange: setResult,
      onLoadingChange: setIsLoading,
      onErrorChange: setError,
      onStatusChange: setStatus,
      onJobIdChange: setJobId,
      onVideoStatusChange: setVideoStatus,
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
    client().updateOptions({ body: currentBody })
  })

  // Cleanup on unmount: stop any in-flight requests
  createEffect(() => {
    return () => {
      client().stop()
    }
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
  }
}
