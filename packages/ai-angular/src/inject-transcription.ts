import { injectGeneration } from './inject-generation'
import type { Signal } from '@angular/core'
import type { TranscriptionResult } from '@tanstack/ai'
import type {
  GenerationClientState,
  InferGenerationOutput,
  TranscriptionGenerateInput,
} from '@tanstack/ai-client'
import type { InjectGenerationOptions } from './inject-generation'

export type InjectTranscriptionOptions<TOutput = TranscriptionResult> = Omit<
  InjectGenerationOptions<TranscriptionGenerateInput, TranscriptionResult, TOutput>,
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

export function injectTranscription<
  TOnResult extends ((result: TranscriptionResult) => any) | undefined =
    undefined,
>(
  options: Omit<InjectTranscriptionOptions, 'onResult'> & {
    onResult?: TOnResult
  },
): InjectTranscriptionResult<
  InferGenerationOutput<TranscriptionResult, TOnResult>
> {
  const devtools = {
    ...options.devtools,
    framework: 'angular' as const,
    hookName: 'injectTranscription',
    outputKind: 'text' as const,
  }
  const { generate, result, isLoading, error, status, stop, reset } =
    injectGeneration<TranscriptionGenerateInput, TranscriptionResult, TOnResult>({
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
