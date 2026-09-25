import { createGeneration } from './create-generation.ts'
import { reconstructSummarizeResult } from '@tanstack/ai-client'
import type { Handle } from 'remix/ui'
import type { SummarizationResult } from '@tanstack/ai'
import type {
  GenerationPersistenceOptions,
  SummarizeGenerateInput,
} from '@tanstack/ai-client'
import type {
  CreateGenerationOptions,
  CreateGenerationReturn,
} from './create-generation.ts'

/**
 * Options for the createSummarize helper.
 *
 * Handle is the first argument of the helper. It is not part of this type.
 *
 * @template TOutput - The output type after optional transform (defaults to SummarizationResult)
 */
export type CreateSummarizeOptions<TOutput = SummarizationResult> = Omit<
  CreateGenerationOptions<SummarizeGenerateInput, SummarizationResult, TOutput>,
  'onResult' | 'reconstructResult'
> & {
  onResult?: (result: SummarizationResult) => TOutput | null | void
}

/**
 * Return type for the createSummarize helper.
 *
 * @template TOutput - The output type (after optional transform)
 */
export type CreateSummarizeReturn<TOutput = SummarizationResult> =
  CreateGenerationReturn<TOutput, SummarizeGenerateInput>

/**
 * Creates a text summarization helper for Remix setup.
 *
 * Call this in a Remix component setup function. Pass the component Handle as
 * the first argument.
 *
 * @example
 * ```tsx
 * import { createSummarize } from '@tanstack/ai-remix'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 * import type { Handle } from 'remix/ui'
 *
 * function Summarizer(handle: Handle) {
 *   const summarizer = createSummarize(handle, {
 *     connection: fetchServerSentEvents('/api/summarize'),
 *   })
 *
 *   return () => (
 *     <div>
 *       <button
 *         onClick={() =>
 *           summarizer.generate({
 *             text: 'Long article text...',
 *             style: 'bullet-points',
 *             maxLength: 200,
 *           })
 *         }
 *       >
 *         Summarize
 *       </button>
 *       {summarizer.isLoading ? <p>Summarizing...</p> : null}
 *       {summarizer.result ? <p>{summarizer.result.summary}</p> : null}
 *     </div>
 *   )
 * }
 * ```
 */
export function createSummarize<TTransformed = void>(
  handle: Pick<Handle, 'id' | 'update' | 'signal'>,
  options: Omit<
    CreateSummarizeOptions,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: SummarizationResult) => TTransformed
  } & GenerationPersistenceOptions,
) {
  const devtools = {
    ...options.devtools,
    hookName: 'createSummarize',
    outputKind: 'text' as const,
  }
  return createGeneration<
    SummarizeGenerateInput,
    SummarizationResult,
    TTransformed
  >(handle, {
    ...options,
    devtools,
    reconstructResult: reconstructSummarizeResult,
  })
}
