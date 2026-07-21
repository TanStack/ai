import { injectGeneration } from './inject-generation'
import type { Signal } from '@angular/core'
import type { TranscriptionResult } from '@tanstack/ai'
import type {
  GenerationClientState,
  InferGenerationOutputFromReturn,
  TranscriptionGenerateInput,
} from '@tanstack/ai-client'
import type { InjectGenerationOptions } from './inject-generation'

export type InjectTranscriptionOptions<TOutput = TranscriptionResult> = Omit<
  InjectGenerationOptions<
    TranscriptionGenerateInput,
    TranscriptionResult,
    TOutput
  >,
  'onResult'
> & {
  onResult?: (result: TranscriptionResult) => TOutput | null | void
}

export interface InjectTranscriptionResult<TOutput = TranscriptionResult> {
  generate: (input: TranscriptionGenerateInput) => Promise<void>
  result: Signal<TOutput | null>
  isLoading: Signal<boolean>
  error: Signal<Error | undefined>
  status: Signal<GenerationClientState>
  stop: () => void
  reset: () => void
}

export function injectTranscription<TTransformed = void>(
  options: Omit<InjectTranscriptionOptions, 'onResult'> & {
    onResult?: (result: TranscriptionResult) => TTransformed
  },
): InjectTranscriptionResult<
  InferGenerationOutputFromReturn<TranscriptionResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'angular' as const,
    hookName: 'injectTranscription',
    outputKind: 'text' as const,
  }
  const { generate, result, isLoading, error, status, stop, reset } =
    injectGeneration<
      TranscriptionGenerateInput,
      TranscriptionResult,
      TTransformed
    >({
      ...options,
      devtools,
    })
  return {
    generate: generate as (input: TranscriptionGenerateInput) => Promise<void>,
    result,
    isLoading,
    error,
    status,
    stop,
    reset,
  }
}
