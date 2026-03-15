import { GenerationClient } from '@tanstack/ai-client'
import type { StreamChunk } from '@tanstack/ai'
import type {
  ConnectConnectionAdapter,
  GenerationClientOptions,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutput,
} from '@tanstack/ai-client'

/**
 * Options for the createGeneration function.
 *
 * Accepts either a `connection` (streaming transport) or a `fetcher` (direct async call).
 *
 * @template TInput - The input type for the generation request
 * @template TResult - The result type returned by the generation
 * @template TOutput - The output type after optional transform (defaults to TResult)
 */
export interface CreateGenerationOptions<TInput, TResult, TOutput = TResult> {
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
 * Return type for the createGeneration function.
 *
 * @template TOutput - The output type (after optional transform)
 */
export interface CreateGenerationReturn<TOutput> {
  /** The generation result, or null if not yet generated */
  readonly result: TOutput | null
  /** Whether a generation is currently in progress */
  readonly isLoading: boolean
  /** Current error, if any */
  readonly error: Error | undefined
  /** Current state of the generation client */
  readonly status: GenerationClientState
  /** Trigger a generation request */
  generate: (input: Record<string, any>) => Promise<void>
  /** Abort the current generation */
  stop: () => void
  /** Clear result, error, and return to idle */
  reset: () => void
  /** Update additional body parameters */
  updateBody: (body: Record<string, any>) => void
}

/**
 * Creates a reactive generation instance for Svelte 5.
 *
 * This is the base function used by `createGenerateImage`, `createGenerateSpeech`,
 * `createTranscription`, and `createSummarize`. You can also use it directly
 * for custom generation types.
 *
 * @template TInput - The input type for the generation request
 * @template TResult - The result type returned by the generation
 *
 * @example
 * ```svelte
 * <script>
 *   import { createGeneration, fetchServerSentEvents } from '@tanstack/ai-svelte'
 *
 *   const gen = createGeneration({
 *     connection: fetchServerSentEvents('/api/generate/custom'),
 *   })
 * </script>
 *
 * <div>
 *   <button onclick={() => gen.generate({ prompt: 'Hello' })}>Generate</button>
 *   {#if gen.isLoading}
 *     <p>Generating...</p>
 *   {/if}
 *   {#if gen.result}
 *     <p>{JSON.stringify(gen.result)}</p>
 *   {/if}
 * </div>
 * ```
 */
export function createGeneration<
  TInput extends Record<string, any>,
  TResult,
  TOnResult extends ((result: TResult) => any) | undefined = undefined,
>(
  options: Omit<CreateGenerationOptions<TInput, TResult>, 'onResult'> & {
    onResult?: TOnResult
  },
): CreateGenerationReturn<InferGenerationOutput<TResult, TOnResult>> {
  type TOutput = InferGenerationOutput<TResult, TOnResult>
  const clientId =
    options.id || `gen-${Date.now()}-${Math.random().toString(36).substring(7)}`

  // Create reactive state using Svelte 5 runes
  let result = $state<TOutput | null>(null)
  let isLoading = $state(false)
  let error = $state<Error | undefined>(undefined)
  let status = $state<GenerationClientState>('idle')

  const clientOptions: GenerationClientOptions<TInput, TResult, TOutput> = {
    id: clientId,
    body: options.body,
    onResult: (r: TResult) => options.onResult?.(r),
    onError: (e: Error) => options.onError?.(e),
    onProgress: (p: number, m?: string) => options.onProgress?.(p, m),
    onChunk: (c: StreamChunk) => options.onChunk?.(c),
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
      'createGeneration requires either a connection or fetcher option',
    )
  }

  // Note: Cleanup is handled by calling stop() directly when needed.
  // Unlike React/Vue/Solid, Svelte 5 runes like $effect can only be used
  // during component initialization, so we don't add automatic cleanup here.
  // Users should call gen.stop() in their component's cleanup if needed.

  const generate = async (input: TInput) => {
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
    get isLoading() {
      return isLoading
    },
    get error() {
      return error
    },
    get status() {
      return status
    },
    generate: generate as (input: Record<string, any>) => Promise<void>,
    stop,
    reset,
    updateBody,
  }
}
