import { useGeneration } from './use-generation'
import type {
  UseGenerationOptions,
  UseGenerationReturn,
} from './use-generation'
import type { Model3dResult, StreamChunk } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutputFromReturn,
  Model3dGenerateInput,
} from '@tanstack/ai-client'
import type { Accessor } from 'solid-js'

/**
 * Options for the useGenerate3dModel hook.
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 *
 * @template TOutput - The transformed output type (defaults to Model3dResult)
 */
export interface UseGenerate3dModelOptions<
  TOutput = Model3dResult,
> extends Pick<
  UseGenerationOptions<Model3dGenerateInput, Model3dResult, TOutput>,
  'threadId' | 'byok' | 'byokProvider' | 'body'
> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for 3D model generation */
  fetcher?: GenerationFetcher<Model3dGenerateInput, Model3dResult>
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  /**
   * Callback when the 3D model is ready. Can optionally return a transformed value.
   *
   * - Return a non-null value to transform and store it as the result
   * - Return `null` to keep the previous result unchanged
   * - Return nothing (`void`) to store the raw result as-is
   */
  onResult?: (result: Model3dResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /**
   * Callback on each provider poll. `progress` is 0-100 and `message` is the
   * job status (`'pending'`, `'processing'` or `'completed'`).
   */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

/**
 * Return type for the useGenerate3dModel hook.
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 *
 * @template TOutput - The transformed output type (defaults to Model3dResult)
 */
export interface UseGenerate3dModelReturn<TOutput = Model3dResult> extends Omit<
  UseGenerationReturn<TOutput>,
  'generate'
> {
  /** Trigger 3D model generation */
  generate: (input: Model3dGenerateInput) => Promise<void>
  /** The finished 3D model, or null */
  result: Accessor<TOutput | null>
  /** Whether generation is in progress */
  isLoading: Accessor<boolean>
  /** Current error, if any */
  error: Accessor<Error | undefined>
  /** Current state of the generation */
  status: Accessor<GenerationClientState>
}

/**
 * Solid hook for generating 3D models (text-to-3D, image-to-3D) using AI models.
 *
 * The server polls the provider job and streams `generation:progress` events,
 * then one `generation:result` event with the finished model.
 *
 * Supports two transport modes:
 * - **ConnectConnectionAdapter** -- Streaming transport (SSE, HTTP stream, custom)
 * - **Fetcher** -- Direct async function call
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 *
 * @example
 * ```tsx
 * import { useGenerate3dModel } from '@tanstack/ai-solid2'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 *
 * function ModelGenerator() {
 *   const { generate, result, isLoading, error } = useGenerate3dModel({
 *     threadId: 'robot-model',
 *     connection: fetchServerSentEvents('/api/generate/3d-model'),
 *   })
 *
 *   return (
 *     <div>
 *       <button onClick={() => generate({ prompt: 'A small toy robot' })}>
 *         Generate
 *       </button>
 *       {isLoading() && <p>Generating...</p>}
 *       {error() && <p>Error: {error()!.message}</p>}
 *       {result() && <a href={result()!.url}>Download {result()!.format}</a>}
 *     </div>
 *   )
 * }
 * ```
 */
export function useGenerate3dModel<TTransformed = void>(
  options: Omit<UseGenerate3dModelOptions, 'onResult'> & {
    onResult?: (result: Model3dResult) => TTransformed
  },
): UseGenerate3dModelReturn<
  InferGenerationOutputFromReturn<Model3dResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'solid',
    hookName: 'useGenerate3dModel',
  }
  return useGeneration<Model3dGenerateInput, Model3dResult, TTransformed>({
    ...options,
    // The spread above would freeze a caller-supplied `get body()`. Re-expose
    // it so useGeneration keeps tracking the current body.
    get body() {
      return options.body
    },
    devtools,
    // 3D results are never persisted, even if an untyped caller sets it.
    persistence: false,
  })
}
