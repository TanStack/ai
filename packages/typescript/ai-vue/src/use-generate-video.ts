import { VideoGenerationClient } from '@tanstack/ai-client'
import { onScopeDispose, readonly, shallowRef, useId, watch } from 'vue'
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
import type { DeepReadonly, ShallowRef } from 'vue'

/**
 * Options for the useGenerateVideo composable.
 *
 * @template TOutput - The output type after optional transform (defaults to VideoGenerateResult)
 */
export interface UseGenerateVideoOptions<TOutput = VideoGenerateResult> {
  /** Connect-based adapter for streaming transport (server handles polling) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for creating a video job */
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
 * Return type for the useGenerateVideo composable.
 *
 * @template TOutput - The output type (after optional transform)
 */
export interface UseGenerateVideoReturn<TOutput = VideoGenerateResult> {
  /** Trigger video generation */
  generate: (input: VideoGenerateInput) => Promise<void>
  /** The final video result (with URL), or null */
  result: DeepReadonly<ShallowRef<TOutput | null>>
  /** The current job ID, or null */
  jobId: DeepReadonly<ShallowRef<string | null>>
  /** Current video generation status info, or null */
  videoStatus: DeepReadonly<ShallowRef<VideoStatusInfo | null>>
  /** Whether generation/polling is in progress */
  isLoading: DeepReadonly<ShallowRef<boolean>>
  /** Current error, if any */
  error: DeepReadonly<ShallowRef<Error | undefined>>
  /** Current state of the generation */
  status: DeepReadonly<ShallowRef<GenerationClientState>>
  /** Abort the current generation/polling */
  stop: () => void
  /** Clear all state and return to idle */
  reset: () => void
}

/**
 * Vue composable for generating videos using AI models.
 *
 * Video generation is asynchronous: a job is created, then polled for status
 * until completion. This composable handles the full lifecycle.
 *
 * @example
 * ```vue
 * <script setup>
 * import { useGenerateVideo } from '@tanstack/ai-vue'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 *
 * const { generate, result, videoStatus, isLoading } = useGenerateVideo({
 *   connection: fetchServerSentEvents('/api/generate/video'),
 *   onStatusUpdate: (status) => console.log(`Progress: ${status.progress}%`),
 * })
 * </script>
 *
 * <template>
 *   <div>
 *     <button @click="generate({ prompt: 'A flying car over a city' })">
 *       Generate Video
 *     </button>
 *     <p v-if="isLoading && videoStatus">
 *       Status: {{ videoStatus.status }} ({{ videoStatus.progress }}%)
 *     </p>
 *     <video v-if="result" :src="result.url" controls />
 *   </div>
 * </template>
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
  const hookId = useId()
  const clientId = options.id || hookId

  const result = shallowRef<TOutput | null>(null)
  const jobId = shallowRef<string | null>(null)
  const videoStatus = shallowRef<VideoStatusInfo | null>(null)
  const isLoading = shallowRef(false)
  const error = shallowRef<Error | undefined>(undefined)
  const status = shallowRef<GenerationClientState>('idle')

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
      result.value = r
    },
    onLoadingChange: (l: boolean) => {
      isLoading.value = l
    },
    onErrorChange: (e: Error | undefined) => {
      error.value = e
    },
    onStatusChange: (s: GenerationClientState) => {
      status.value = s
    },
    onJobIdChange: (id: string | null) => {
      jobId.value = id
    },
    onVideoStatusChange: (s: VideoStatusInfo | null) => {
      videoStatus.value = s
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
      'useGenerateVideo requires either a connection or fetcher option',
    )
  }

  // Sync body changes to the client
  watch(
    () => options.body,
    (newBody) => {
      client.updateOptions({ body: newBody })
    },
  )

  // Cleanup on scope dispose: stop any in-flight requests or polling
  onScopeDispose(() => {
    client.stop()
  })

  const generate = async (input: VideoGenerateInput) => {
    await client.generate(input)
  }

  const stop = () => {
    client.stop()
  }

  const reset = () => {
    client.reset()
  }

  return {
    generate,
    result: readonly(result),
    jobId: readonly(jobId),
    videoStatus: readonly(videoStatus),
    isLoading: readonly(isLoading),
    error: readonly(error),
    status: readonly(status),
    stop,
    reset,
  }
}
