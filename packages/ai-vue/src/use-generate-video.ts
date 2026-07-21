import { VideoGenerationClient } from '@tanstack/ai-client'
import { createVideoDevtoolsBridge } from '@tanstack/ai-client/devtools'
import {
  onMounted,
  onScopeDispose,
  readonly,
  shallowRef,
  useId,
  watch,
} from 'vue'
import type { StreamChunk } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutputFromReturn,
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
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
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
  const hookId = useId()
  const clientId = options.id || hookId

  const result = shallowRef<TOutput | null>(null)
  const jobId = shallowRef<string | null>(null)
  const videoStatus = shallowRef<VideoStatusInfo | null>(null)
  const isLoading = shallowRef(false)
  const error = shallowRef<Error | undefined>(undefined)
  const status = shallowRef<GenerationClientState>('idle')

  // Conditional spread on `body`: `VideoGenerationClientOptions.body` is a
  // strict optional and under EOPT we must omit the key when absent rather
  // than assign `undefined`.
  const baseOptions = {
    id: clientId,
    body: options.body,
    devtoolsBridgeFactory: createVideoDevtoolsBridge,
    devtools: {
      ...options.devtools,
      framework: 'vue',
      hookName: 'useGenerateVideo',
      outputKind: 'video' as const,
    },
    // The transform's raw return type (`TTransformed`) and the stored output
    // (`TOutput`, with null/void/undefined stripped) are identical at runtime;
    // the cast bridges the relationship that the conditional type hides.
    onResult: ((r: VideoGenerateResult) => options.onResult?.(r)) as (
      result: VideoGenerateResult,
    ) => TOutput | null | void,
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

  // Sync body changes to the client.
  // Conditional spread: `updateOptions` declares `body?: Record<string, any>`
  // (strict optional) and rejects explicit `undefined` under EOPT.
  watch(
    () => options.body,
    (newBody) => {
      client.updateOptions({
        ...(newBody !== undefined && { body: newBody }),
      })
    },
  )

  onMounted(() => {
    client.mountDevtools()
  })

  // Cleanup on scope dispose: stop any in-flight requests and unregister devtools
  onScopeDispose(() => {
    client.dispose()
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
    // `readonly()` distributes `DeepReadonly`/`UnwrapNestedRefs` over the
    // `TOutput` conditional, which TS can't prove equal to the declared
    // `DeepReadonly<ShallowRef<TOutput | null>>` while `TTransformed` is free.
    // They are identical at runtime; the cast restores the declared shape.
    result: readonly(result) as UseGenerateVideoReturn<TOutput>['result'],
    jobId: readonly(jobId),
    videoStatus: readonly(videoStatus),
    isLoading: readonly(isLoading),
    error: readonly(error),
    status: readonly(status),
    stop,
    reset,
  }
}
