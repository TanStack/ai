import { GenerationClient } from '@tanstack/ai-client'
import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
} from 'solid-js'
import type { StreamChunk } from '@tanstack/ai'
import type {
  ConnectConnectionAdapter,
  GenerationClientOptions,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutput,
} from '@tanstack/ai-client'
import type { Accessor } from 'solid-js'

/**
 * Options for the useGeneration hook.
 *
 * Accepts either a `connection` (streaming transport) or a `fetcher` (direct async call).
 *
 * @template TInput - The input type for the generation request
 * @template TResult - The result type returned by the generation
 * @template TOutput - The transformed output type (defaults to TResult)
 */
export interface UseGenerationOptions<TInput, TResult, TOutput = TResult> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for one-shot generation (no streaming protocol needed) */
  fetcher?: GenerationFetcher<TInput, TResult>
  /** Unique identifier for this generation instance */
  id?: string
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
  /**
   * Callback when a result is received. Can optionally return a transformed value.
   *
   * - Return a non-null value to transform and store it as the result
   * - Return `null` to keep the previous result unchanged
   * - Return nothing (`void`) to store the raw result as-is
   */
  onResult?: (result: TResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

/**
 * Return type for the useGeneration hook.
 *
 * @template TOutput - The output type (possibly transformed from the raw result)
 */
export interface UseGenerationReturn<TOutput> {
  /** Trigger a generation request */
  generate: (input: Record<string, any>) => Promise<void>
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
}

/**
 * Generic Solid hook for one-shot generation tasks.
 *
 * This is the base hook used by `useGenerateImage`, `useGenerateSpeech`,
 * `useTranscription`, and `useSummarize`. You can also use it directly
 * for custom generation types.
 *
 * @template TInput - The input type for the generation request
 * @template TResult - The result type returned by the generation
 * @template TOutput - The transformed output type (defaults to TResult)
 *
 * @example
 * ```tsx
 * const { generate, result, isLoading } = useGeneration<MyInput, MyResult>({
 *   connection: fetchServerSentEvents('/api/generate/custom'),
 * })
 *
 * await generate({ prompt: 'Hello' })
 * ```
 */
export function useGeneration<
  TInput extends Record<string, any>,
  TResult,
  TOnResult extends ((result: TResult) => any) | undefined = undefined,
>(
  options: Omit<UseGenerationOptions<TInput, TResult>, 'onResult'> & {
    onResult?: TOnResult
  },
): UseGenerationReturn<InferGenerationOutput<TResult, TOnResult>> {
  type TOutput = InferGenerationOutput<TResult, TOnResult>
  const hookId = createUniqueId()
  const clientId = options.id || hookId

  const [result, setResult] = createSignal<TOutput | null>(null)
  const [isLoading, setIsLoading] = createSignal(false)
  const [error, setError] = createSignal<Error | undefined>(undefined)
  const [status, setStatus] = createSignal<GenerationClientState>('idle')

  const client = createMemo(() => {
    const clientOptions: GenerationClientOptions<TInput, TResult, TOutput> = {
      id: clientId,
      body: options.body,
      onResult: (r: TResult) => options.onResult?.(r),
      onError: (e: Error) => options.onError?.(e),
      onProgress: (p: number, m?: string) => options.onProgress?.(p, m),
      onChunk: (c: StreamChunk) => options.onChunk?.(c),
      onResultChange: setResult,
      onLoadingChange: setIsLoading,
      onErrorChange: setError,
      onStatusChange: setStatus,
    }

    if (options.connection) {
      return new GenerationClient<TInput, TResult, TOutput>({
        ...clientOptions,
        connection: options.connection,
      })
    }

    if (options.fetcher) {
      return new GenerationClient<TInput, TResult, TOutput>({
        ...clientOptions,
        fetcher: options.fetcher,
      })
    }

    throw new Error(
      'useGeneration requires either a connection or fetcher option',
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

  const generate = async (input: TInput) => {
    await client().generate(input)
  }

  const stop = () => {
    client().stop()
  }

  const reset = () => {
    client().reset()
  }

  return {
    generate: generate as (input: Record<string, any>) => Promise<void>,
    result,
    isLoading,
    error,
    status,
    stop,
    reset,
  }
}
