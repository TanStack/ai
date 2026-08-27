import { VideoGenerationClient } from '@tanstack/ai-client'
import { createVideoDevtoolsBridge } from '@tanstack/ai-client/devtools'
import { onMounted, onScopeDispose, readonly, shallowRef, watch } from 'vue'
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
  /**
   * The id of the generation job currently running, or `null` when nothing is in
   * flight. Each call to `generate` is one job with its own id. Pass it to your
   * own endpoint to cancel or poll the provider job — `stop()` only aborts the
   * local stream, it does not stop work already running on the provider.
   */
  runId: DeepReadonly<ShallowRef<string | null>>
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
  /** The final video result (with URL), or null */
  const result = shallowRef<TOutput | null>(null)
  /** The current job ID, or null */
  const jobId = shallowRef<string | null>(null)
  /** Current video generation status info, or null */
  const videoStatus = shallowRef<VideoStatusInfo | null>(null)
  /** Whether generation/polling is in progress */
  const isLoading = shallowRef(false)
  /** Current error, if any */
  const error = shallowRef<Error | undefined>(undefined)
  /** Current state of the generation */
  const status = shallowRef<GenerationClientState>('idle')
  const runId = shallowRef<string | null>(null)
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
      framework: 'vue',
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
      if (disposed) return
      result.value = r
    },
    onLoadingChange: (l: boolean) => {
      if (disposed) return
      isLoading.value = l
    },
    onErrorChange: (e: Error | undefined) => {
      if (disposed) return
      error.value = e
    },
    onStatusChange: (s: GenerationClientState) => {
      if (disposed) return
      status.value = s
    },
    onJobIdChange: (id: string | null) => {
      if (disposed) return
      jobId.value = id
    },
    onVideoStatusChange: (s: VideoStatusInfo | null) => {
      if (disposed) return
      videoStatus.value = s
    },
    onResumeStateChange: (rs: { runId: string } | null) => {
      if (disposed) return
      runId.value = rs?.runId ?? null
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

  watch(
    () => options.body,
    (newBody) => {
      client.updateOptions({
        ...(newBody !== undefined && { body: newBody }),
      })
    },
  )

  // Mount devtools only. Generation runs are never auto-started on mount —
  // persisted state is read-only for display.
  onMounted(() => {
    client.mountDevtools()
  })

  // Cleanup on scope dispose: stop any in-flight requests and unregister devtools
  onScopeDispose(() => {
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
    result: readonly(result) as UseGenerateVideoReturn<TOutput>['result'],
    jobId: readonly(jobId),
    videoStatus: readonly(videoStatus),
    isLoading: readonly(isLoading),
    error: readonly(error),
    status: readonly(status),
    stop,
    reset,
    runId: readonly(runId),
  }
}
