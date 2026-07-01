import { useGeneration } from './use-generation'
import type { StreamChunk, SummarizationResult } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutputFromReturn,
  SummarizeGenerateInput,
} from '@tanstack/ai-client'
import type { Accessor } from 'solid-js'

/**
 * Options for the useSummarize hook.
 *
 * @template TOutput - The transformed output type (defaults to SummarizationResult)
 */
export interface UseSummarizeOptions<TOutput = SummarizationResult> {
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
 * Return type for the useSummarize hook.
 *
 * @template TOutput - The transformed output type (defaults to SummarizationResult)
 */
export interface UseSummarizeReturn<TOutput = SummarizationResult> {
  /** Trigger summarization */
  generate: (input: SummarizeGenerateInput) => Promise<void>
  /** The summarization result, or null */
  result: Accessor<TOutput | null>
  /** Whether summarization is in progress */
  isLoading: Accessor<boolean>
  /** Current error, if any */
  error: Accessor<Error | undefined>
  /** Current state of the generation */
  status: Accessor<GenerationClientState>
  /** Abort the current summarization */
  stop: () => void
  /** Clear result, error, and return to idle */
  reset: () => void
}

/**
 * Solid hook for summarizing text using AI models.
 *
 * @example
 * ```tsx
 * import { useSummarize } from '@tanstack/ai-solid'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 *
 * function Summarizer() {
 *   const { generate, result, isLoading } = useSummarize({
 *     connection: fetchServerSentEvents('/api/summarize'),
 *   })
 *
 *   return (
 *     <div>
 *       <button onClick={() => generate({
 *         text: 'Long article text...',
 *         style: 'bullet-points',
 *         maxLength: 200,
 *       })}>
 *         Summarize
 *       </button>
 *       {isLoading() && <p>Summarizing...</p>}
 *       {result() && <p>{result()!.summary}</p>}
 *     </div>
 *   )
 * }
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
    framework: 'solid',
    hookName: 'useSummarize',
    outputKind: 'text' as const,
  }
  const { generate, result, isLoading, error, status, stop, reset } =
    useGeneration<SummarizeGenerateInput, SummarizationResult, TTransformed>({
      ...options,
      devtools,
    })

  return {
    generate: generate as (input: SummarizeGenerateInput) => Promise<void>,
    result,
    isLoading,
    error,
    status,
    stop,
    reset,
  }
}
