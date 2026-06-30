import { injectGeneration } from './inject-generation'
import type { Signal } from '@angular/core'
import type { ImageGenerationResult } from '@tanstack/ai'
import type {
  GenerationClientState,
  ImageGenerateInput,
  InferGenerationOutputFromReturn,
} from '@tanstack/ai-client'
import type { InjectGenerationOptions } from './inject-generation'

export type InjectGenerateImageOptions<TOutput = ImageGenerationResult> = Omit<
  InjectGenerationOptions<ImageGenerateInput, ImageGenerationResult, TOutput>,
  'onResult'
> & {
  onResult?: (result: ImageGenerationResult) => TOutput | null | void
}

export interface InjectGenerateImageResult<TOutput = ImageGenerationResult> {
  generate: (input: ImageGenerateInput) => Promise<void>
  result: Signal<TOutput | null>
  isLoading: Signal<boolean>
  error: Signal<Error | undefined>
  status: Signal<GenerationClientState>
  stop: () => void
  reset: () => void
}

export function injectGenerateImage<TTransformed = void>(
  options: Omit<InjectGenerateImageOptions, 'onResult'> & {
    onResult?: (result: ImageGenerationResult) => TTransformed
  },
): InjectGenerateImageResult<
  InferGenerationOutputFromReturn<ImageGenerationResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'angular' as const,
    hookName: 'injectGenerateImage',
    outputKind: 'image' as const,
  }
  const { generate, result, isLoading, error, status, stop, reset } =
    injectGeneration<ImageGenerateInput, ImageGenerationResult, TTransformed>({
      ...options,
      devtools,
    })
  return {
    generate: generate as (input: ImageGenerateInput) => Promise<void>,
    result,
    isLoading,
    error,
    status,
    stop,
    reset,
  }
}
