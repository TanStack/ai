import { GenerationClient } from '@tanstack/ai-client'
import { onScopeDispose, readonly, shallowRef, useId, watch } from 'vue'
import type { StreamChunk } from '@tanstack/ai'
import type {
  ConnectConnectionAdapter,
  GenerationClientOptions,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutput,
} from '@tanstack/ai-client'
import type { DeepReadonly, ShallowRef } from 'vue'

/**
 * Options for the useGeneration hook.
 *
 * Accepts either a `connection` (streaming transport) or a `fetcher` (direct async call).
 *
 * @template TInput - The input type for the generation request
 * @template TResult - The result type returned by the generation
 * @template TOutput - The output type after optional transform (defaults to TResult)
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
 * @template TOutput - The output type (after optional transform)
 */
export interface UseGenerationReturn<TOutput> {
  /** Trigger a generation request */
  generate: (input: Record<string, any>) => Promise<void>
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
}

/**
 * Generic Vue composable for one-shot generation tasks.
 *
 * This is the base composable used by `useGenerateImage`, `useGenerateSpeech`,
 * `useTranscription`, and `useSummarize`. You can also use it directly
 * for custom generation types.
 *
 * @template TInput - The input type for the generation request
 * @template TResult - The result type returned by the generation
 *
 * @example
 * ```vue
 * <script setup>
 * import { useGeneration } from '@tanstack/ai-vue'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 *
 * const { generate, result, isLoading } = useGeneration({
 *   connection: fetchServerSentEvents('/api/generate/custom'),
 * })
 * </script>
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
  const hookId = useId()
  const clientId = options.id || hookId

  const result = shallowRef<TOutput | null>(null)
  const isLoading = shallowRef(false)
  const error = shallowRef<Error | undefined>(undefined)
  const status = shallowRef<GenerationClientState>('idle')

  const clientOptions: GenerationClientOptions<TInput, TResult, TOutput> = {
    id: clientId,
    body: options.body,
    onResult: (r: TResult) => options.onResult?.(r),
    onError: (e: Error) => options.onError?.(e),
    onProgress: (p: number, m?: string) => options.onProgress?.(p, m),
    onChunk: (c: StreamChunk) => options.onChunk?.(c),
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
  }

  let client: GenerationClient<TInput, TResult, TOutput>

  if (options.connection) {
    client = new GenerationClient<TInput, TResult, TOutput>({
      ...clientOptions,
      connection: options.connection,
    })
  } else if (options.fetcher) {
    client = new GenerationClient<TInput, TResult, TOutput>({
      ...clientOptions,
      fetcher: options.fetcher,
    })
  } else {
    throw new Error(
      'useGeneration requires either a connection or fetcher option',
    )
  }

  // Sync body changes to the client
  watch(
    () => options.body,
    (newBody) => {
      client.updateOptions({ body: newBody })
    },
  )

  // Cleanup on scope dispose: stop any in-flight requests
  onScopeDispose(() => {
    client.stop()
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
    generate: generate as (input: Record<string, any>) => Promise<void>,
    result: readonly(result),
    isLoading: readonly(isLoading),
    error: readonly(error),
    status: readonly(status),
    stop,
    reset,
  }
}
