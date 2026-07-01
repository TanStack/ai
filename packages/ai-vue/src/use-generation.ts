import { GenerationClient } from '@tanstack/ai-client'
import { createGenerationDevtoolsBridge } from '@tanstack/ai-client/devtools'
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
  GenerationClientOptions,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutputFromReturn,
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
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
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
// `TTransformed` infers from the `onResult` return position (a covariant
// inference site that works even for an optional nested property), which types
// the callback parameter as `TResult` and narrows `result`. Inferring the
// whole callback as a defaulted type parameter instead collapses to the
// default, leaving the parameter `any` — a hard error under `strict`. See
// issue #848.
export function useGeneration<
  TInput extends Record<string, any>,
  TResult,
  TTransformed = void,
>(
  options: Omit<UseGenerationOptions<TInput, TResult>, 'onResult'> & {
    onResult?: (result: TResult) => TTransformed
  },
): UseGenerationReturn<InferGenerationOutputFromReturn<TResult, TTransformed>> {
  type TOutput = InferGenerationOutputFromReturn<TResult, TTransformed>
  const hookId = useId()
  const clientId = options.id || hookId

  const result = shallowRef<TOutput | null>(null)
  const isLoading = shallowRef(false)
  const error = shallowRef<Error | undefined>(undefined)
  const status = shallowRef<GenerationClientState>('idle')

  // Conditional spread on `body`: `GenerationClientOptions.body` is a strict
  // optional (`body?: Record<string, any>`), and under EOPT we must omit the
  // key when absent rather than assign `undefined`.
  const clientOptions: GenerationClientOptions<TInput, TResult, TOutput> = {
    id: clientId,
    body: options.body,
    devtoolsBridgeFactory: createGenerationDevtoolsBridge,
    devtools: {
      ...options.devtools,
      framework: 'vue',
      hookName: 'useGeneration',
    },
    // The transform's raw return type (`TTransformed`) and the stored output
    // (`TOutput`, with null/void/undefined stripped) are identical at runtime;
    // the cast bridges the relationship that the conditional type hides.
    onResult: ((r: TResult) => options.onResult?.(r)) as (
      result: TResult,
    ) => TOutput | null | void,
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
    // `readonly()` distributes `DeepReadonly`/`UnwrapNestedRefs` over the
    // `TOutput` conditional, which TS can't prove equal to the declared
    // `DeepReadonly<ShallowRef<TOutput | null>>` while `TTransformed` is free.
    // They are identical at runtime; the cast restores the declared shape.
    result: readonly(result) as UseGenerationReturn<TOutput>['result'],
    isLoading: readonly(isLoading),
    error: readonly(error),
    status: readonly(status),
    stop,
    reset,
  }
}
