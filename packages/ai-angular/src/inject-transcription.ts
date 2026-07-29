import { injectGeneration } from './inject-generation'
import { reconstructTranscriptionResult } from '@tanstack/ai-client'
import type { Signal } from '@angular/core'
import type { TranscriptionResult } from '@tanstack/ai'
import type {
  GenerationClientState,
  GenerationPersistenceOptions,
  InferGenerationOutputFromReturn,
  TranscriptionGenerateInput,
} from '@tanstack/ai-client'
import type {
  InjectGenerationOptions,
  InjectGenerationResult,
} from './inject-generation'

export type InjectTranscriptionOptions<TOutput = TranscriptionResult> = Omit<
  InjectGenerationOptions<
    TranscriptionGenerateInput,
    TranscriptionResult,
    TOutput
  >,
  'onResult' | 'reconstructResult'
> & {
  onResult?: (result: TranscriptionResult) => TOutput | null | void
}

export interface InjectTranscriptionResult<
  TOutput = TranscriptionResult,
> extends Omit<InjectGenerationResult<TOutput>, 'generate'> {
  generate: (input: TranscriptionGenerateInput) => Promise<void>
  result: Signal<TOutput | null>
  isLoading: Signal<boolean>
  error: Signal<Error | undefined>
  status: Signal<GenerationClientState>
}

export function injectTranscription<TTransformed = void>(
  options: Omit<
    InjectTranscriptionOptions,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: TranscriptionResult) => TTransformed
  } & GenerationPersistenceOptions,
): InjectTranscriptionResult<
  InferGenerationOutputFromReturn<TranscriptionResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'angular' as const,
    hookName: 'injectTranscription',
    outputKind: 'text' as const,
  }
  const generation = injectGeneration<
    TranscriptionGenerateInput,
    TranscriptionResult,
    TTransformed
  >({
    ...options,
    devtools,
    reconstructResult: reconstructTranscriptionResult,
  })
  return generation
}
