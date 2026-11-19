import { createGeneration } from './create-generation.svelte'
import type {
  CreateGenerationOptions,
  CreateGenerationReturn,
} from './create-generation.svelte'
import type { Model3DResult, StreamChunk } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutputFromReturn,
  Model3DGenerateInput,
} from '@tanstack/ai-client'

/**
 * Options for the createGenerate3DModel function.
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 *
 * @template TOutput - The output type after optional transform (defaults to Model3DResult)
 */
export interface CreateGenerate3DModelOptions<
  TOutput = Model3DResult,
> extends Pick<
  CreateGenerationOptions<Model3DGenerateInput, Model3DResult, TOutput>,
  'threadId' | 'byok' | 'byokProvider'
> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for 3D model generation */
  fetcher?: GenerationFetcher<Model3DGenerateInput, Model3DResult>
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  /**
   * Callback when the 3D model is ready. Can optionally return a transformed value.
   *
   * - Return a non-null value to transform and store it as the result
   * - Return `null` to keep the previous result unchanged
   * - Return nothing (`void`) to store the raw result as-is
   */
  onResult?: (result: Model3DResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /**
   * Callback when progress is reported (0-100). The message is the job
   * status: `'pending'`, `'processing'`, or `'completed'`.
   */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

/**
 * Return type for the createGenerate3DModel function.
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 *
 * @template TOutput - The output type (after optional transform)
 */
export interface CreateGenerate3DModelReturn<
  TOutput = Model3DResult,
> extends Omit<CreateGenerationReturn<TOutput>, 'generate'> {
  /** The finished 3D model, or null */
  readonly result: TOutput | null
  /** Whether generation is in progress */
  readonly isLoading: boolean
  /** Current error, if any */
  readonly error: Error | undefined
  /** Current state of the generation */
  readonly status: GenerationClientState
  /** Trigger 3D model generation */
  generate: (input: Model3DGenerateInput) => Promise<void>
}

/**
 * Creates a reactive 3D model generation instance for Svelte 5.
 *
 * Supports two transport modes:
 * - **ConnectConnectionAdapter** -- Streaming transport (SSE, HTTP stream, custom)
 * - **Fetcher** -- Direct async function call
 *
 * The server sends one `generation:progress` event per poll and then one
 * `generation:result` event with the `Model3DResult`.
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 *
 * @example
 * ```svelte
 * <script>
 *   import { createGenerate3DModel, fetchServerSentEvents } from '@tanstack/ai-svelte'
 *
 *   const modelGen = createGenerate3DModel({
 *     threadId: 'robot-model',
 *     connection: fetchServerSentEvents('/api/generate/3d-model'),
 *     onProgress: (progress, status) => console.log(status, progress),
 *   })
 * </script>
 *
 * <div>
 *   <button onclick={() => modelGen.generate({ prompt: 'A small toy robot' })}>
 *     Generate
 *   </button>
 *   {#if modelGen.isLoading}
 *     <p>Generating...</p>
 *   {/if}
 *   {#if modelGen.error}
 *     <p>Error: {modelGen.error.message}</p>
 *   {/if}
 *   {#if modelGen.result}
 *     <a href={modelGen.result.url}>Download {modelGen.result.format}</a>
 *   {/if}
 * </div>
 * ```
 */
export function createGenerate3DModel<TTransformed = void>(
  options: Omit<CreateGenerate3DModelOptions, 'onResult'> & {
    onResult?: (result: Model3DResult) => TTransformed
  },
): CreateGenerate3DModelReturn<
  InferGenerationOutputFromReturn<Model3DResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'svelte',
    hookName: 'createGenerate3DModel',
  }
  const gen = createGeneration<
    Model3DGenerateInput,
    Model3DResult,
    TTransformed
  >({
    ...options,
    devtools,
    // 3D results are never persisted, even if an untyped caller sets it.
    persistence: false,
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
