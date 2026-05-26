import { createGeneration } from './create-generation.svelte'
import type { ImageGenerationResult, StreamChunk } from '@tanstack/ai'
import type {
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  ImageGenerateInput,
  InferGenerationOutput,
} from '@tanstack/ai-client'

/**
 * Options for the createGenerateImage function.
 *
 * @template TOutput - The output type after optional transform (defaults to ImageGenerationResult)
 */
export interface CreateGenerateImageOptions<TOutput = ImageGenerationResult> {
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
 * Return type for the createGenerateImage function.
 *
 * @template TOutput - The output type (after optional transform)
 */
export interface CreateGenerateImageReturn<TOutput = ImageGenerationResult> {
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
  /** Abort the current generation */
  stop: () => void
  /** Clear result, error, and return to idle */
  reset: () => void
  /** Update additional body parameters */
  updateBody: (body: Record<string, any>) => void
}

/**
 * Creates a reactive image generation instance for Svelte 5.
 *
 * Supports two transport modes:
 * - **ConnectConnectionAdapter** -- Streaming transport (SSE, HTTP stream, custom)
 * - **Fetcher** -- Direct async function call
 *
 * @example
 * ```svelte
 * <script>
 *   import { createGenerateImage, fetchServerSentEvents } from '@tanstack/ai-svelte'
 *
 *   const imageGen = createGenerateImage({
 *     connection: fetchServerSentEvents('/api/generate/image'),
 *   })
 * </script>
 *
 * <div>
 *   <button onclick={() => imageGen.generate({ prompt: 'A sunset over mountains' })}>
 *     Generate
 *   </button>
 *   {#if imageGen.isLoading}
 *     <p>Generating...</p>
 *   {/if}
 *   {#if imageGen.error}
 *     <p>Error: {imageGen.error.message}</p>
 *   {/if}
 *   {#if imageGen.result}
 *     {#each imageGen.result.images as img}
 *       <img src={img.url || `data:image/png;base64,${img.b64Json}`} alt="Generated" />
 *     {/each}
 *   {/if}
 * </div>
 * ```
 */
export function createGenerateImage<
  TOnResult extends ((result: ImageGenerationResult) => any) | undefined =
    undefined,
>(
  options: Omit<CreateGenerateImageOptions, 'onResult'> & {
    onResult?: TOnResult
  },
): CreateGenerateImageReturn<
  InferGenerationOutput<ImageGenerationResult, TOnResult>
> {
  const gen = createGeneration<
    ImageGenerateInput,
    ImageGenerationResult,
    TOnResult
  >(options)

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
    generate: gen.generate as (input: ImageGenerateInput) => Promise<void>,
    stop: gen.stop,
    reset: gen.reset,
    updateBody: gen.updateBody,
  }
}
