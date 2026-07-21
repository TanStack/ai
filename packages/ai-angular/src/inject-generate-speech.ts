import { injectGeneration } from './inject-generation'
import type { Signal } from '@angular/core'
import type { TTSResult } from '@tanstack/ai'
import type {
  GenerationClientState,
  InferGenerationOutputFromReturn,
  SpeechGenerateInput,
} from '@tanstack/ai-client'
import type { InjectGenerationOptions } from './inject-generation'

export type InjectGenerateSpeechOptions<TOutput = TTSResult> = Omit<
  InjectGenerationOptions<SpeechGenerateInput, TTSResult, TOutput>,
  'onResult'
> & {
  onResult?: (result: TTSResult) => TOutput | null | void
}

export interface InjectGenerateSpeechResult<TOutput = TTSResult> {
  generate: (input: SpeechGenerateInput) => Promise<void>
  result: Signal<TOutput | null>
  isLoading: Signal<boolean>
  error: Signal<Error | undefined>
  status: Signal<GenerationClientState>
  stop: () => void
  reset: () => void
}

export function injectGenerateSpeech<TTransformed = void>(
  options: Omit<InjectGenerateSpeechOptions, 'onResult'> & {
    onResult?: (result: TTSResult) => TTransformed
  },
): InjectGenerateSpeechResult<
  InferGenerationOutputFromReturn<TTSResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'angular' as const,
    hookName: 'injectGenerateSpeech',
    outputKind: 'audio' as const,
  }
  const { generate, result, isLoading, error, status, stop, reset } =
    injectGeneration<SpeechGenerateInput, TTSResult, TTransformed>({
      ...options,
      devtools,
    })
  return {
    generate: generate as (input: SpeechGenerateInput) => Promise<void>,
    result,
    isLoading,
    error,
    status,
    stop,
    reset,
  }
}
