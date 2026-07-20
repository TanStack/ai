import { useGeneration } from './use-generation'
import type {
  UseGenerationOptions,
  UseGenerationReturn,
} from './use-generation'
import type { StreamChunk, SummarizationResult } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutputFromReturn,
  SummarizeGenerateInput,
} from '@tanstack/ai-client'
import type { DeepReadonly, ShallowRef } from 'vue'

/**
 * Options for the useSummarize composable.
 *
 * @template TOutput - The output type after optional transform (defaults to SummarizationResult)
 */
export interface UseSummarizeOptions<
  TOutput = SummarizationResult,
> extends Pick<
  UseGenerationOptions<SummarizeGenerateInput, SummarizationResult, TOutput>,
  'persistence' | 'initialResumeSnapshot'
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
 * Return type for the useSummarize composable.
 *
 * @template TOutput - The output type (after optional transform)
 */
export interface UseSummarizeReturn<TOutput = SummarizationResult> extends Omit<
  UseGenerationReturn<TOutput>,
  'generate'
> {
  /** Trigger summarization */
  generate: (input: SummarizeGenerateInput) => Promise<void>
  /** The summarization result, or null */
  result: DeepReadonly<ShallowRef<TOutput | null>>
  /** Whether summarization is in progress */
  isLoading: DeepReadonly<ShallowRef<boolean>>
  /** Current error, if any */
  error: DeepReadonly<ShallowRef<Error | undefined>>
  /** Current state of the generation */
  status: DeepReadonly<ShallowRef<GenerationClientState>>
}

/**
 * Vue composable for summarizing text using AI models.
 *
 * @example
 * ```vue
 * <script setup>
 * import { useSummarize } from '@tanstack/ai-vue'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 *
 * const { generate, result, isLoading } = useSummarize({
 *   connection: fetchServerSentEvents('/api/summarize'),
 * })
 * </script>
 *
 * <template>
 *   <div>
 *     <button @click="generate({
 *       text: 'Long article text...',
 *       style: 'bullet-points',
 *       maxLength: 200,
 *     })">
 *       Summarize
 *     </button>
 *     <p v-if="isLoading">Summarizing...</p>
 *     <p v-if="result">{{ result.summary }}</p>
 *   </div>
 * </template>
 * ```
 */
export function useSummarize<TTransformed = void>(
  options: Omit<UseSummarizeOptions, 'onResult'> & {
    onResult?: (result: SummarizationResult) => TTransformed
  },
): UseSummarizeReturn<
  InferGenerationOutputFromReturn<SummarizationResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'vue',
    hookName: 'useSummarize',
    outputKind: 'text' as const,
  }
  const generation = useGeneration<
    SummarizeGenerateInput,
    SummarizationResult,
    TTransformed
  >({
    ...options,
    devtools,
  })

  return {
    ...generation,
    generate: generation.generate as (
      input: SummarizeGenerateInput,
    ) => Promise<void>,
  }
}
