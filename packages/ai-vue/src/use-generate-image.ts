import { useGeneration } from './use-generation'
import { reconstructImageResult } from '@tanstack/ai-client'
import type {
  UseGenerationOptions,
  UseGenerationReturn,
} from './use-generation'
import type { ImageGenerationResult, StreamChunk } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  GenerationPersistenceOptions,
  ImageGenerateInput,
  InferGenerationOutputFromReturn,
} from '@tanstack/ai-client'
import type { DeepReadonly, ShallowRef } from 'vue'

export interface UseGenerateImageOptions<
  TOutput = ImageGenerationResult,
> extends Pick<
  UseGenerationOptions<ImageGenerateInput, ImageGenerationResult, TOutput>,
  | 'persistence'
  | 'threadId'
  | 'hydrateGeneration'
  | 'joinRun'
  | 'byok'
  | 'byokProvider'
> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for image generation */
  fetcher?: GenerationFetcher<ImageGenerateInput, ImageGenerationResult>
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  onResult?: (result: ImageGenerationResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

export interface UseGenerateImageReturn<
  TOutput = ImageGenerationResult,
> extends Omit<UseGenerationReturn<TOutput>, 'generate'> {
  /** Trigger image generation */
  generate: (input: ImageGenerateInput) => Promise<void>
  /** The generation result containing images, or null */
  result: DeepReadonly<ShallowRef<TOutput | null>>
  /** Whether generation is in progress */
  isLoading: DeepReadonly<ShallowRef<boolean>>
  /** Current error, if any */
  error: DeepReadonly<ShallowRef<Error | undefined>>
  /** Current state of the generation */
  status: DeepReadonly<ShallowRef<GenerationClientState>>
}

export function useGenerateImage<TTransformed = void>(
  options: Omit<
    UseGenerateImageOptions,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: ImageGenerationResult) => TTransformed
  } & GenerationPersistenceOptions,
): UseGenerateImageReturn<
  InferGenerationOutputFromReturn<ImageGenerationResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'vue',
    hookName: 'useGenerateImage',
    outputKind: 'image' as const,
  }
  const generation = useGeneration<
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
