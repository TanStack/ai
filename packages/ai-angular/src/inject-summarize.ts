import { injectGeneration } from './inject-generation'
import { reconstructSummarizeResult } from '@tanstack/ai-client'
import type { Signal } from '@angular/core'
import type { SummarizationResult } from '@tanstack/ai'
import type {
  GenerationClientState,
  GenerationPersistenceOptions,
  InferGenerationOutputFromReturn,
  SummarizeGenerateInput,
} from '@tanstack/ai-client'
import type {
  InjectGenerationOptions,
  InjectGenerationResult,
} from './inject-generation'

export type InjectSummarizeOptions<TOutput = SummarizationResult> = Omit<
  InjectGenerationOptions<SummarizeGenerateInput, SummarizationResult, TOutput>,
  'onResult' | 'reconstructResult'
> & {
  onResult?: (result: SummarizationResult) => TOutput | null | void
}

export interface InjectSummarizeResult<
  TOutput = SummarizationResult,
> extends Omit<InjectGenerationResult<TOutput>, 'generate'> {
  generate: (input: SummarizeGenerateInput) => Promise<void>
  result: Signal<TOutput | null>
  isLoading: Signal<boolean>
  error: Signal<Error | undefined>
  status: Signal<GenerationClientState>
}

export function injectSummarize<TTransformed = void>(
  options: Omit<
    InjectSummarizeOptions,
    'onResult' | 'persistence' | 'threadId' | 'id'
  > & {
    onResult?: (result: SummarizationResult) => TTransformed
  } & GenerationPersistenceOptions,
): InjectSummarizeResult<
  InferGenerationOutputFromReturn<SummarizationResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'angular' as const,
    hookName: 'injectSummarize',
    outputKind: 'text' as const,
  }
  const generation = injectGeneration<
    SummarizeGenerateInput,
    SummarizationResult,
    TTransformed
  >({
    ...options,
    devtools,
    reconstructResult: reconstructSummarizeResult,
  })
  return generation
}
