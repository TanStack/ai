import { VideoGenerationClient } from '@tanstack/ai-client'
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
  /** Update additional body parameters */
  updateBody: (body: Record<string, any>) => void
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
export function createGenerateVideo<
  TOnResult extends ((result: VideoGenerateResult) => any) | undefined =
    undefined,
>(
  options: Omit<CreateGenerateVideoOptions, 'onResult'> & {
    onResult?: TOnResult
  },
): CreateGenerateVideoReturn<
  InferGenerationOutput<VideoGenerateResult, TOnResult>
> {
  type TOutput = InferGenerationOutput<VideoGenerateResult, TOnResult>
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

  const baseOptions = {
    id: clientId,
    body: options.body,
    onResult: (r: VideoGenerateResult) => options.onResult?.(r),
    onError: (e: Error) => options.onError?.(e),
    onProgress: (p: number, m?: string) => options.onProgress?.(p, m),
    onChunk: (c: StreamChunk) => options.onChunk?.(c),
    onJobCreated: (id: string) => options.onJobCreated?.(id),
    onStatusUpdate: (s: VideoStatusInfo) => options.onStatusUpdate?.(s),
    onResultChange: (r: TOutput | null) => {
      result = r
    },
    onLoadingChange: (l: boolean) => {
      isLoading = l
    },
    onErrorChange: (e: Error | undefined) => {
      error = e
    },
    onStatusChange: (s: GenerationClientState) => {
      status = s
    },
    onJobIdChange: (id: string | null) => {
      jobId = id
    },
    onVideoStatusChange: (s: VideoStatusInfo | null) => {
      videoStatus = s
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

  // Note: Cleanup is handled by calling stop() directly when needed.
  // Unlike React/Vue/Solid, Svelte 5 runes like $effect can only be used
  // during component initialization, so we don't add automatic cleanup here.
  // Users should call video.stop() in their component's cleanup if needed.

  const generate = async (input: VideoGenerateInput) => {
    await client.generate(input)
  }

  const stop = () => {
    client.stop()
  }

  const reset = () => {
    client.reset()
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
    updateBody,
  }
}
