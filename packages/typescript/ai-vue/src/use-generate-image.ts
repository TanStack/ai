import { useGeneration } from './use-generation'
import type { ImageGenerationResult, StreamChunk } from '@tanstack/ai'
import type {
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  ImageGenerateInput,
  InferGenerationOutput,
} from '@tanstack/ai-client'
import type { DeepReadonly, ShallowRef } from 'vue'

/**
 * Options for the useGenerateImage composable.
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
 * Return type for the useGenerateImage composable.
 *
 * @template TOutput - The output type (after optional transform)
 */
export interface UseGenerateImageReturn<TOutput = ImageGenerationResult> {
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
  /** Abort the current generation */
  stop: () => void
  /** Clear result, error, and return to idle */
  reset: () => void
}

/**
 * Vue composable for generating images using AI models.
 *
 * Supports two transport modes:
 * - **ConnectConnectionAdapter** — Streaming transport (SSE, HTTP stream, custom)
 * - **Fetcher** — Direct async function call
 *
 * @example
 * ```vue
 * <script setup>
 * import { useGenerateImage } from '@tanstack/ai-vue'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 *
 * const { generate, result, isLoading, error, reset } = useGenerateImage({
 *   connection: fetchServerSentEvents('/api/generate/image'),
 * })
 * </script>
 *
 * <template>
 *   <div>
 *     <button @click="generate({ prompt: 'A sunset over mountains' })">
 *       Generate
 *     </button>
 *     <p v-if="isLoading">Generating...</p>
 *     <p v-if="error">Error: {{ error.message }}</p>
 *     <img
 *       v-for="(img, i) in result?.images"
 *       :key="i"
 *       :src="img.url || `data:image/png;base64,${img.b64Json}`"
 *     />
 *   </div>
 * </template>
 * ```
 */
export function useGenerateImage<
  TOnResult extends ((result: ImageGenerationResult) => any) | undefined =
    undefined,
>(
  options: Omit<UseGenerateImageOptions, 'onResult'> & {
    onResult?: TOnResult
  },
): UseGenerateImageReturn<
  InferGenerationOutput<ImageGenerationResult, TOnResult>
> {
  const { generate, result, isLoading, error, status, stop, reset } =
    useGeneration<ImageGenerateInput, ImageGenerationResult, TOnResult>(options)

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
