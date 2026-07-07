import { createGeneration } from './create-generation.svelte'
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
  ImageGenerateInput,
  InferGenerationOutputFromReturn,
} from '@tanstack/ai-client'

/**
 * Options for the createGenerateImage function.
 *
 * @template TOutput - The output type after optional transform (defaults to ImageGenerationResult)
 */
export interface CreateGenerateImageOptions<
  TOutput = ImageGenerationResult,
> extends Pick<
  CreateGenerationOptions<ImageGenerateInput, ImageGenerationResult, TOutput>,
  'persistence' | 'autoResume' | 'initialResumeSnapshot' | 'resumeState'
> {
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
export function createGenerateImage<TTransformed = void>(
  options: Omit<CreateGenerateImageOptions, 'onResult'> & {
    onResult?: (result: ImageGenerationResult) => TTransformed
  },
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
    generate: gen.generate as (input: ImageGenerateInput) => Promise<void>,
    stop: gen.stop,
    reset: gen.reset,
    updateBody: gen.updateBody,
    dispose: gen.dispose,
    get resumeSnapshot() {
      return gen.resumeSnapshot
    },
    get resumeState() {
      return gen.resumeState
    },
    get pendingArtifacts() {
      return gen.pendingArtifacts
    },
    get resultArtifacts() {
      return gen.resultArtifacts
    },
    resume: gen.resume,
  }
}
