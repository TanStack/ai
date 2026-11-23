import { createGeneration } from './create-generation.ts'
import type { Handle } from 'remix/ui'
import type { Model3dResult } from '@tanstack/ai'
import type { Model3dGenerateInput } from '@tanstack/ai-client'
import type {
  CreateGenerationOptions,
  CreateGenerationReturn,
} from './create-generation.ts'

/**
 * Options for the createGenerate3dModel helper.
 *
 * Handle is the first argument of the helper. It is not part of this type.
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 *
 * @template TOutput - The output type after optional transform (defaults to Model3dResult)
 */
export type CreateGenerate3dModelOptions<TOutput = Model3dResult> = Omit<
  CreateGenerationOptions<Model3dGenerateInput, Model3dResult, TOutput>,
  | 'onResult'
  | 'reconstructResult'
  | 'persistence'
  | 'hydrateGeneration'
  | 'joinRun'
> & {
  onResult?: (result: Model3dResult) => TOutput | null | void
}

/**
 * Return type for the createGenerate3dModel helper.
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 *
 * @template TOutput - The output type (after optional transform)
 */
export type CreateGenerate3dModelReturn<TOutput = Model3dResult> =
  CreateGenerationReturn<TOutput, Model3dGenerateInput>

/**
 * Creates a 3D model generation helper for Remix setup (text-to-3D,
 * image-to-3D, 3D-to-3D).
 *
 * Supports two transport modes:
 * - **ConnectConnectionAdapter**: streaming transport (SSE, HTTP stream, custom)
 * - **Fetcher**: direct async function call
 *
 * The server streams a `generation:progress` event for each provider poll and
 * one `generation:result` event with the finished model.
 *
 * Call this in a Remix component setup function. Pass the component Handle as
 * the first argument.
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 *
 * @example
 * ```tsx
 * import { createGenerate3dModel } from '@tanstack/ai-remix'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 * import type { Handle } from 'remix/ui'
 *
 * function ModelGenerator(handle: Handle) {
 *   const model = createGenerate3dModel(handle, {
 *     threadId: 'hero-model',
 *     connection: fetchServerSentEvents('/api/3d-model'),
 *   })
 *
 *   return () => (
 *     <div>
 *       <button onClick={() => model.generate({ prompt: 'A low-poly fox' })}>
 *         Generate
 *       </button>
 *       {model.isLoading ? <p>Generating...</p> : null}
 *       {model.result ? (
 *         <a href={model.result.url}>Download .{model.result.format}</a>
 *       ) : null}
 *     </div>
 *   )
 * }
 * ```
 */
export function createGenerate3dModel<TTransformed = void>(
  handle: Pick<Handle, 'update' | 'signal'>,
  options: Omit<CreateGenerate3dModelOptions, 'onResult'> & {
    onResult?: (result: Model3dResult) => TTransformed
  },
) {
  const devtools = { ...options.devtools, hookName: 'createGenerate3dModel' }
  return createGeneration<Model3dGenerateInput, Model3dResult, TTransformed>(
    handle,
    // 3D results are never persisted, even if an untyped caller sets it.
    { ...options, devtools, persistence: false },
  )
}
