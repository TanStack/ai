import { GenerationClient } from '@tanstack/ai-client'
import { createGenerationDevtoolsBridge } from '@tanstack/ai-client/devtools'
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
  GenerationClientOptions,
  GenerationClientState,
  GenerationFetcher,
  GenerationPersistenceOptions,
  GenerationRestoredResult,
  InferGenerationOutputFromReturn,
} from '@tanstack/ai-client'
import type { ByokClient } from '@tanstack/ai-client/byok'
import type { ProviderId } from '@tanstack/ai/byok'
import type { Accessor } from 'solid-js'

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
  result: Accessor<TOutput | null>
  /** Whether a generation is currently in progress */
  isLoading: Accessor<boolean>
  /** Current error, if any */
  error: Accessor<Error | undefined>
  /** Current state of the generation client */
  status: Accessor<GenerationClientState>
  /** Abort the current generation */
  stop: () => void
  /** Clear result, error, and return to idle */
  reset: () => void
  runId: Accessor<string | null>
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

  const [result, setResult] = createSignal<TOutput | null>(null)
  const [isLoading, setIsLoading] = createSignal(false)
  const [error, setError] = createSignal<Error | undefined>(undefined)
  const [status, setStatus] = createSignal<GenerationClientState>('idle')
  const [runId, setRunId] = createSignal<string | null>(null)
  let disposed = false

  const client = untrack((): GenerationClient<TInput, TResult, TOutput> => {
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
        framework: 'solid',
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
      onResultChange: (r) => {
        if (!disposed) setResult(() => r)
      },
      onLoadingChange: (l) => {
        if (!disposed) setIsLoading(l)
      },
      onErrorChange: (e) => {
        if (!disposed) setError(e)
      },
      onStatusChange: (s) => {
        if (!disposed) setStatus(s)
      },
      onResumeStateChange: (rs) => {
        if (!disposed) setRunId(rs?.runId ?? null)
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

    if (options.connection) {
      return new GenerationClient<TInput, TResult, TOutput>({
        ...clientOptions,
        ...persistenceProps,
        connection: options.connection,
      })
    }

    if (options.fetcher) {
      return new GenerationClient<TInput, TResult, TOutput>({
        ...clientOptions,
        ...persistenceProps,
        fetcher: options.fetcher,
      })
    }

    throw new Error(
      'useGeneration requires either a connection or fetcher option',
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
    result,
    isLoading,
    error,
    status,
    stop,
    reset,
    runId,
  }
}
