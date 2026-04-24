import { createGeneration } from './create-generation.svelte'
import type { StreamChunk, SummarizationResult } from '@tanstack/ai'
import type {
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutput,
  SummarizeGenerateInput,
} from '@tanstack/ai-client'

/**
 * Options for the createSummarize function.
 *
 * @template TOutput - The output type after optional transform (defaults to SummarizationResult)
 */
export interface CreateSummarizeOptions<TOutput = SummarizationResult> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for summarization */
  fetcher?: GenerationFetcher<SummarizeGenerateInput, SummarizationResult>
  /** Unique identifier for this generation instance */
  id?: string
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
  /**
   * Callback when summarization is complete. Can optionally return a transformed value.
   *
   * - Return a non-null value to transform and store it as the result
   * - Return `null` to keep the previous result unchanged
   * - Return nothing (`void`) to store the raw result as-is
   */
  onResult?: (result: SummarizationResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

/**
 * Return type for the createSummarize function.
 *
 * @template TOutput - The output type (after optional transform)
 */
export interface CreateSummarizeReturn<TOutput = SummarizationResult> {
  /** The summarization result, or null */
  readonly result: TOutput | null
  /** Whether summarization is in progress */
  readonly isLoading: boolean
  /** Current error, if any */
  readonly error: Error | undefined
  /** Current state of the generation */
  readonly status: GenerationClientState
  /** Trigger summarization */
  generate: (input: SummarizeGenerateInput) => Promise<void>
  /** Abort the current summarization */
  stop: () => void
  /** Clear result, error, and return to idle */
  reset: () => void
  /** Update additional body parameters */
  updateBody: (body: Record<string, any>) => void
}

/**
 * Creates a reactive text summarization instance for Svelte 5.
 *
 * @example
 * ```svelte
 * <script>
 *   import { createSummarize, fetchServerSentEvents } from '@tanstack/ai-svelte'
 *
 *   const summarizer = createSummarize({
 *     connection: fetchServerSentEvents('/api/summarize'),
 *   })
 * </script>
 *
 * <div>
 *   <button onclick={() => summarizer.generate({
 *     text: 'Long article text...',
 *     style: 'bullet-points',
 *     maxLength: 200,
 *   })}>
 *     Summarize
 *   </button>
 *   {#if summarizer.isLoading}
 *     <p>Summarizing...</p>
 *   {/if}
 *   {#if summarizer.result}
 *     <p>{summarizer.result.summary}</p>
 *   {/if}
 * </div>
 * ```
 */
export function createSummarize<
  TOnResult extends ((result: SummarizationResult) => any) | undefined =
    undefined,
>(
  options: Omit<CreateSummarizeOptions, 'onResult'> & {
    onResult?: TOnResult
  },
): CreateSummarizeReturn<
  InferGenerationOutput<SummarizationResult, TOnResult>
> {
  const gen = createGeneration<
    SummarizeGenerateInput,
    SummarizationResult,
    TOnResult
  >(options)

  return {
    get result() {
      return gen.result
    },
    get isLoading() {
      return gen.isLoading
    },
    get error() {
      return gen.error
    },
    get status() {
      return gen.status
    },
    generate: gen.generate as (input: SummarizeGenerateInput) => Promise<void>,
    stop: gen.stop,
    reset: gen.reset,
    updateBody: gen.updateBody,
  }
}
