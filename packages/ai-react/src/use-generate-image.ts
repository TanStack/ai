import { useGeneration } from './use-generation'
import { reconstructImageResult } from '@tanstack/ai-client'
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
import type { ByokClient } from '@tanstack/ai-client/byok'
import type { ProviderId } from '@tanstack/ai/byok'

export interface UseGenerateImageOptions<TOutput = ImageGenerationResult> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for image generation */
  fetcher?: GenerationFetcher<ImageGenerateInput, ImageGenerationResult>
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
  /** Optional BYOK keyring. Keys go in `x-byok-*` headers, never the body. */
  byok?: ByokClient
  /** Optional provider id. If it returns a slug, only that key is sent. If no slug resolves (`byokProvider`, then `body.provider`), generate throws. */
  byokProvider?: () => ProviderId | undefined
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  persistence?: boolean
  threadId?: string
  hydrateGeneration?: ConnectConnectionAdapter['hydrateGeneration']
  joinRun?: ConnectConnectionAdapter['joinRun']
  onResult?: (result: ImageGenerationResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

export interface UseGenerateImageReturn<TOutput = ImageGenerationResult> {
  /** Trigger image generation */
  generate: (input: ImageGenerateInput) => Promise<void>
  /** The generation result containing images, or null */
  result: TOutput | null
  /** Whether generation is in progress */
  isLoading: boolean
  /** Current error, if any */
  error: Error | undefined
  /** Current state of the generation */
  status: GenerationClientState
  /** Abort the current generation */
  stop: () => void
  /** Clear result, error, and return to idle */
  reset: () => void
  runId: string | null
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
    framework: 'react',
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
