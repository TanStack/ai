import { GenerationClient } from '@tanstack/ai-client'
import { createGenerationDevtoolsBridge } from '@tanstack/ai-client/devtools'
import { onMounted, onScopeDispose, readonly, shallowRef, watch } from 'vue'
import type { StreamChunk } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ConnectConnectionAdapter,
  GenerationClientOptions,
  GenerationClientState,
  GenerationFetcher,
  GenerationPersistenceOptions,
  GenerationRestoredResult,
  InferGenerationOutputFromReturn,
} from '@tanstack/ai-client'
import type { ByokClient } from '@tanstack/ai-client/byok'
import type { ProviderId } from '@tanstack/ai/byok'
import type { DeepReadonly, ShallowRef } from 'vue'

export interface UseGenerationOptions<TInput, TResult, TOutput = TResult> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for one-shot generation (no streaming protocol needed) */
  fetcher?: GenerationFetcher<TInput, TResult>
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
  onResult?: (result: TResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
  reconstructResult?: (restored: GenerationRestoredResult) => TResult | null
}

export interface UseGenerationReturn<
  TOutput,
  TInput extends Record<string, any> = Record<string, any>,
> {
  /** Trigger a generation request */
  generate: (input: TInput) => Promise<void>
  /** The generation result, or null if not yet generated */
  result: DeepReadonly<ShallowRef<TOutput | null>>
  /** Whether a generation is currently in progress */
  isLoading: DeepReadonly<ShallowRef<boolean>>
  /** Current error, if any */
  error: DeepReadonly<ShallowRef<Error | undefined>>
  /** Current state of the generation client */
  status: DeepReadonly<ShallowRef<GenerationClientState>>
  /** Abort the current generation */
  stop: () => void
  /** Clear result, error, and return to idle */
  reset: () => void
  runId: DeepReadonly<ShallowRef<string | null>>
}

export function useGeneration<
  TInput extends Record<string, any>,
  TResult,
  TTransformed = void,
>(
  options: Omit<
    UseGenerationOptions<TInput, TResult>,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: TResult) => TTransformed
  } & GenerationPersistenceOptions,
): UseGenerationReturn<
  InferGenerationOutputFromReturn<TResult, TTransformed>,
  TInput
> {
  type TOutput = InferGenerationOutputFromReturn<TResult, TTransformed>

  const result = shallowRef<TOutput | null>(null)
  const isLoading = shallowRef(false)
  const error = shallowRef<Error | undefined>(undefined)
  const status = shallowRef<GenerationClientState>('idle')
  const runId = shallowRef<string | null>(null)
  let disposed = false

  const clientOptions: Omit<
    GenerationClientOptions<TInput, TResult, TOutput>,
    'persistence' | 'threadId'
  > = {
    body: options.body,
    ...(options.hydrateGeneration !== undefined && {
      hydrateGeneration: options.hydrateGeneration,
    }),
    ...(options.joinRun !== undefined && { joinRun: options.joinRun }),
    ...(options.byok !== undefined && { byok: options.byok }),
    byokProvider: () => options.byokProvider?.(),
    ...(options.reconstructResult
      ? { reconstructResult: options.reconstructResult }
      : {}),
    devtoolsBridgeFactory: createGenerationDevtoolsBridge,
    devtools: {
      ...options.devtools,
      framework: 'vue',
      hookName: 'useGeneration',
    },
    onResult: ((r: TResult) => options.onResult?.(r)) as (
      result: TResult,
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
    onResumeStateChange: (rs) => {
      if (disposed) return
      runId.value = rs?.runId ?? null
    },
  }

  const persistenceProps =
    typeof options.threadId === 'string' && options.persistence
      ? {
          persistence: options.persistence,
          threadId: options.threadId,
        }
      : {
          ...(options.threadId !== undefined && {
            threadId: options.threadId,
          }),
        }

  let client: GenerationClient<TInput, TResult, TOutput>

  if (options.connection) {
    client = new GenerationClient<TInput, TResult, TOutput>({
      ...clientOptions,
      ...persistenceProps,
      connection: options.connection,
    })
  } else if (options.fetcher) {
    client = new GenerationClient<TInput, TResult, TOutput>({
      ...clientOptions,
      ...persistenceProps,
      fetcher: options.fetcher,
    })
  } else {
    throw new Error(
      'useGeneration requires either a connection or fetcher option',
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

  const generate = async (input: TInput) => {
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
    result: readonly(result) as UseGenerationReturn<TOutput>['result'],
    isLoading: readonly(isLoading),
    error: readonly(error),
    status: readonly(status),
    stop,
    reset,
    runId: readonly(runId),
  }
}
