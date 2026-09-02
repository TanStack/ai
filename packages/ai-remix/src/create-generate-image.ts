import { createGeneration } from './create-generation.ts'
import { reconstructImageResult } from '@tanstack/ai-client'
import type { Handle } from 'remix/ui'
import type { ImageGenerationResult } from '@tanstack/ai'
import type {
  GenerationPersistenceOptions,
  ImageGenerateInput,
} from '@tanstack/ai-client'
import type {
  CreateGenerationOptions,
  CreateGenerationReturn,
} from './create-generation.ts'

/**
 * Options for the createGenerateImage helper.
 *
 * Handle is the first argument of the helper. It is not part of this type.
 *
 * @template TOutput - The output type after optional transform (defaults to ImageGenerationResult)
 */
export type CreateGenerateImageOptions<TOutput = ImageGenerationResult> = Omit<
  CreateGenerationOptions<ImageGenerateInput, ImageGenerationResult, TOutput>,
  'onResult' | 'reconstructResult'
> & {
  onResult?: (result: ImageGenerationResult) => TOutput | null | void
}

/**
 * Return type for the createGenerateImage helper.
 *
 * @template TOutput - The output type (after optional transform)
 */
export type CreateGenerateImageReturn<TOutput = ImageGenerationResult> =
  CreateGenerationReturn<TOutput, ImageGenerateInput>

/**
 * Creates an image generation helper for Remix setup.
 *
 * Supports two transport modes:
 * - **ConnectConnectionAdapter** — Streaming transport (SSE, HTTP stream, custom)
 * - **Fetcher** — Direct async function call
 *
 * Call this in a Remix component setup function. Pass the component Handle as
 * the first argument.
 *
 * @example
 * ```tsx
 * import { createGenerateImage } from '@tanstack/ai-remix'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 * import type { Handle } from 'remix/ui'
 *
 * function ImageGenerator(handle: Handle) {
 *   const image = createGenerateImage(handle, {
 *     connection: fetchServerSentEvents('/api/generate/image'),
 *   })
 *
 *   return () => (
 *     <div>
 *       <button onClick={() => image.generate({ prompt: 'A sunset over mountains' })}>
 *         Generate
 *       </button>
 *       {image.isLoading ? <p>Generating...</p> : null}
 *       {image.result?.images.map((img) => (
 *         <img src={img.url || `data:image/png;base64,${img.b64Json}`} />
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export function createGenerateImage<TTransformed = void>(
  handle: Pick<Handle, 'id' | 'update' | 'signal'>,
  options: Omit<
    CreateGenerateImageOptions,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: ImageGenerationResult) => TTransformed
  } & GenerationPersistenceOptions,
) {
  const devtools = {
    ...options.devtools,
    hookName: 'createGenerateImage',
    outputKind: 'image' as const,
  }
  return createGeneration<
    ImageGenerateInput,
    ImageGenerationResult,
    TTransformed
  >(handle, {
    ...options,
    devtools,
    reconstructResult: reconstructImageResult,
  })
}
