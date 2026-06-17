import { injectGeneration } from './inject-generation'
import type { Signal } from '@angular/core'
import type { SummarizationResult } from '@tanstack/ai'
import type {
  GenerationClientState,
  InferGenerationOutput,
  SummarizeGenerateInput,
} from '@tanstack/ai-client'
import type { InjectGenerationOptions } from './inject-generation'

export type InjectSummarizeOptions<TOutput = SummarizationResult> = Omit<
  InjectGenerationOptions<SummarizeGenerateInput, SummarizationResult, TOutput>,
  'onResult'
> & {
  onResult?: (result: SummarizationResult) => TOutput | null | void
}

export interface InjectSummarizeResult<TOutput = SummarizationResult> {
  generate: (input: SummarizeGenerateInput) => Promise<void>
  result: Signal<TOutput | null>
  isLoading: Signal<boolean>
  error: Signal<Error | undefined>
  status: Signal<GenerationClientState>
  stop: () => void
  reset: () => void
}

export function injectSummarize<
  TOnResult extends ((result: SummarizationResult) => any) | undefined =
    undefined,
>(
  options: Omit<InjectSummarizeOptions, 'onResult'> & {
    onResult?: TOnResult
  },
): InjectSummarizeResult<
  InferGenerationOutput<SummarizationResult, TOnResult>
> {
  const devtools = {
    ...options.devtools,
    framework: 'angular' as const,
    hookName: 'injectSummarize',
    outputKind: 'text' as const,
  }
  const { generate, result, isLoading, error, status, stop, reset } =
    injectGeneration<SummarizeGenerateInput, SummarizationResult, TOnResult>({
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
