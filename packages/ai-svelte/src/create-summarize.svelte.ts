import { createGeneration } from './create-generation.svelte'
import type {
  CreateGenerationOptions,
  CreateGenerationReturn,
} from './create-generation.svelte'
import type { StreamChunk, SummarizationResult } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutputFromReturn,
  SummarizeGenerateInput,
} from '@tanstack/ai-client'

/**
 * Options for the createSummarize function.
 *
 * @template TOutput - The output type after optional transform (defaults to SummarizationResult)
 */
export interface CreateSummarizeOptions<
  TOutput = SummarizationResult,
> extends Pick<
  CreateGenerationOptions<SummarizeGenerateInput, SummarizationResult, TOutput>,
  'persistence' | 'autoResume' | 'initialResumeSnapshot' | 'resumeState'
> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for summarization */
  fetcher?: GenerationFetcher<SummarizeGenerateInput, SummarizationResult>
  /** Unique identifier for this generation instance */
  id?: string
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
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
export interface CreateSummarizeReturn<
  TOutput = SummarizationResult,
> extends Omit<CreateGenerationReturn<TOutput>, 'generate'> {
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
export function createSummarize<TTransformed = void>(
  options: Omit<CreateSummarizeOptions, 'onResult'> & {
    onResult?: (result: SummarizationResult) => TTransformed
  },
): CreateSummarizeReturn<
  InferGenerationOutputFromReturn<SummarizationResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'svelte',
    hookName: 'createSummarize',
    outputKind: 'text' as const,
  }
  const gen = createGeneration<
    SummarizeGenerateInput,
    SummarizationResult,
    TTransformed
  >({
    ...options,
    devtools,
  })

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
    dispose: gen.dispose,
    get resumeSnapshot() {
      return gen.resumeSnapshot
    },
    get resumeState() {
      return gen.resumeState
    },
    get pendingArtifacts() {
      return gen.pendingArtifacts
    },
    get resultArtifacts() {
      return gen.resultArtifacts
    },
    resume: gen.resume,
  }
}
