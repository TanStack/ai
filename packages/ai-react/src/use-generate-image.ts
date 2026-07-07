import { useGeneration } from './use-generation'
import type { ImageGenerationResult, StreamChunk } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  GenerationPendingArtifact,
  GenerationPersistenceOptions,
  GenerationResumeSnapshot,
  GenerationResumeState,
  ImageGenerateInput,
  InferGenerationOutputFromReturn,
} from '@tanstack/ai-client'
import type { PersistedArtifactRef } from '@tanstack/ai/client'

/**
 * Options for the useGenerateImage hook.
 *
 * @template TOutput - The output type after optional transform (defaults to ImageGenerationResult)
 */
export interface UseGenerateImageOptions<TOutput = ImageGenerationResult> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for image generation */
  fetcher?: GenerationFetcher<ImageGenerateInput, ImageGenerationResult>
  /** Unique identifier for this generation instance */
  id?: string
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  /** Server-side lightweight resume state persistence. */
  persistence?: GenerationPersistenceOptions
  /** Whether to resume a persisted run on mount. Defaults to true. */
  autoResume?: boolean
  /** Initial lightweight resume snapshot restored by the app. */
  initialResumeSnapshot?: GenerationResumeSnapshot
  /** Explicit run/cursor state to use for the next resume/generation request. */
  resumeState?: GenerationResumeState
  /**
   * Callback when images are generated. Can optionally return a transformed value.
   *
   * - Return a non-null value to transform and store it as the result
   * - Return `null` to keep the previous result unchanged
   * - Return nothing (`void`) to store the raw result as-is
   */
  onResult?: (result: ImageGenerationResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

/**
 * Return type for the useGenerateImage hook.
 *
 * @template TOutput - The output type (after optional transform)
 */
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
  /** Lightweight generation resume snapshot, if one is available */
  resumeSnapshot: GenerationResumeSnapshot | undefined
  /** Current resumable run/cursor state, if one is available */
  resumeState: GenerationResumeState | null
  /** Pending persisted artifact references observed during generation/replay */
  pendingArtifacts: Array<GenerationPendingArtifact>
  /** Final persisted artifact references observed from a replayed result */
  resultArtifacts: Array<PersistedArtifactRef>
  /** Resume the current/initial image generation run, if resumable */
  resume: (state?: GenerationResumeState) => Promise<boolean>
}

/**
 * React hook for generating images using AI models.
 *
 * Supports two transport modes:
 * - **ConnectConnectionAdapter** — Streaming transport (SSE, HTTP stream, custom)
 * - **Fetcher** — Direct async function call
 *
 * @example
 * ```tsx
 * import { useGenerateImage } from '@tanstack/ai-react'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 *
 * function ImageGenerator() {
 *   const { generate, result, isLoading, error, reset } = useGenerateImage({
 *     connection: fetchServerSentEvents('/api/generate/image'),
 *   })
 *
 *   return (
 *     <div>
 *       <button onClick={() => generate({ prompt: 'A sunset over mountains' })}>
 *         Generate
 *       </button>
 *       {isLoading && <p>Generating...</p>}
 *       {error && <p>Error: {error.message}</p>}
 *       {result?.images.map((img, i) => (
 *         <img key={i} src={img.url || `data:image/png;base64,${img.b64Json}`} />
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export function useGenerateImage<TTransformed = void>(
  options: Omit<UseGenerateImageOptions, 'onResult'> & {
    onResult?: (result: ImageGenerationResult) => TTransformed
  },
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
  })

  return {
    ...generation,
    generate: generation.generate as (
      input: ImageGenerateInput,
    ) => Promise<void>,
  }
}
