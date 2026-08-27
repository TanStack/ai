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
  persistence?: boolean
  threadId?: string
  hydrateGeneration?: ConnectConnectionAdapter['hydrateGeneration']
  joinRun?: ConnectConnectionAdapter['joinRun']
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
  runId: DeepReadonly<ShallowRef<string | null>>
}

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
  const result = shallowRef<TOutput | null>(null)
  const jobId = shallowRef<string | null>(null)
  const videoStatus = shallowRef<VideoStatusInfo | null>(null)
  const isLoading = shallowRef(false)
  const error = shallowRef<Error | undefined>(undefined)
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
