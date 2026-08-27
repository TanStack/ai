import { createGeneration } from './create-generation.svelte'
import { reconstructImageResult } from '@tanstack/ai-client'
import type {
  CreateGenerationOptions,
  CreateGenerationReturn,
} from './create-generation.svelte'
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

export interface CreateGenerateImageOptions<
  TOutput = ImageGenerationResult,
> extends Pick<
  CreateGenerationOptions<ImageGenerateInput, ImageGenerationResult, TOutput>,
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

export interface CreateGenerateImageReturn<
  TOutput = ImageGenerationResult,
> extends Omit<CreateGenerationReturn<TOutput>, 'generate'> {
  /** The generation result containing images, or null */
  readonly result: TOutput | null
  /** Whether generation is in progress */
  readonly isLoading: boolean
  /** Current error, if any */
  readonly error: Error | undefined
  /** Current state of the generation */
  readonly status: GenerationClientState
  /** Trigger image generation */
  generate: (input: ImageGenerateInput) => Promise<void>
}

export function createGenerateImage<TTransformed = void>(
  options: Omit<
    CreateGenerateImageOptions,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: ImageGenerationResult) => TTransformed
  } & GenerationPersistenceOptions,
): CreateGenerateImageReturn<
  InferGenerationOutputFromReturn<ImageGenerationResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'svelte',
    hookName: 'createGenerateImage',
    outputKind: 'image' as const,
  }
  const gen = createGeneration<
    ImageGenerateInput,
    ImageGenerationResult,
    TTransformed
  >({
    ...options,
    devtools,
    reconstructResult: reconstructImageResult,
  })

  return {
    get result() {
      return gen.result
    },
    get isLoading() {
      return gen.isLoading
    },
    get error() {
      return gen.error
    },
    get status() {
      return gen.status
    },
    generate: gen.generate,
    stop: gen.stop,
    reset: gen.reset,
    updateBody: gen.updateBody,
    dispose: gen.dispose,
    get runId() {
      return gen.runId
    },
  }
}
