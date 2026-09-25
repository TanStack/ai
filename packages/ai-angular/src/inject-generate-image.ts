import { injectGeneration } from './inject-generation'
import { reconstructImageResult } from '@tanstack/ai-client'
import type { Signal } from '@angular/core'
import type { ImageGenerationResult } from '@tanstack/ai'
import type {
  GenerationClientState,
  GenerationPersistenceOptions,
  ImageGenerateInput,
  InferGenerationOutputFromReturn,
} from '@tanstack/ai-client'
import type {
  InjectGenerationOptions,
  InjectGenerationResult,
} from './inject-generation'

export type InjectGenerateImageOptions<TOutput = ImageGenerationResult> = Omit<
  InjectGenerationOptions<ImageGenerateInput, ImageGenerationResult, TOutput>,
  'onResult' | 'reconstructResult'
> & {
  onResult?: (result: ImageGenerationResult) => TOutput | null | void
}

export interface InjectGenerateImageResult<
  TOutput = ImageGenerationResult,
> extends Omit<InjectGenerationResult<TOutput>, 'generate'> {
  generate: (input: ImageGenerateInput) => Promise<void>
  result: Signal<TOutput | null>
  isLoading: Signal<boolean>
  error: Signal<Error | undefined>
  status: Signal<GenerationClientState>
}

export function injectGenerateImage<TTransformed = void>(
  options: Omit<
    InjectGenerateImageOptions,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: ImageGenerationResult) => TTransformed
  } & GenerationPersistenceOptions,
): InjectGenerateImageResult<
  InferGenerationOutputFromReturn<ImageGenerationResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'angular' as const,
    hookName: 'injectGenerateImage',
    outputKind: 'image' as const,
  }
  const generation = injectGeneration<
    ImageGenerateInput,
    ImageGenerationResult,
    TTransformed
  >({
    ...options,
    devtools,
    reconstructResult: reconstructImageResult,
  })
  return generation
}
