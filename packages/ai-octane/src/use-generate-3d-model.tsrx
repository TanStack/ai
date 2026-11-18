import { useGeneration } from './use-generation.tsrx'
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
 * Options for the useGenerate3DModel hook.
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 *
 * @template TOutput - The output type after optional transform (defaults to Model3DResult)
 */
export interface UseGenerate3DModelOptions<TOutput = Model3DResult> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for 3D model generation */
  fetcher?: GenerationFetcher<Model3DGenerateInput, Model3DResult>
  /** Stable scope for this generation. Also the wire and DevTools identity. */
  threadId: string
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
   * Callback for each provider poll. `progress` is 0-100. `message` is the
   * job state (`'pending'`, `'processing'` or `'completed'`).
   */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

/**
 * Return type for the useGenerate3DModel hook.
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 *
 * @template TOutput - The output type (after optional transform)
 */
export interface UseGenerate3DModelReturn<TOutput = Model3DResult> {
  /** Start 3D model generation */
  generate: (input: Model3DGenerateInput) => Promise<void>
  /** The finished 3D model (url, format, files), or null */
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
}

/**
 * Octane hook for generating 3D models (text-to-3D, image-to-3D, 3D-to-3D).
 *
 * Supports two transport modes:
 * - **ConnectConnectionAdapter** — Streaming transport (SSE, HTTP stream, custom)
 * - **Fetcher** — Direct async function call
 *
 * The server streams a `generation:progress` event for each provider poll and
 * one `generation:result` event with the finished model.
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 *
 * @example
 * ```tsx
 * import { useGenerate3DModel } from '@tanstack/ai-octane'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 *
 * function ModelGenerator() {
 *   const { generate, result, isLoading, error } = useGenerate3DModel({
 *     threadId: 'hero-model',
 *     connection: fetchServerSentEvents('/api/3d-model'),
 *     onProgress: (progress, message) => console.log(progress, message),
 *   })
 *
 *   return (
 *     <div>
 *       <button onClick={() => generate({ prompt: 'A low-poly fox' })}>
 *         Generate
 *       </button>
 *       {isLoading && <p>Generating...</p>}
 *       {error && <p>Error: {error.message}</p>}
 *       {result && <a href={result.url}>Download .{result.format}</a>}
 *     </div>
 *   )
 * }
 * ```
 */
export function useGenerate3DModel<TTransformed = void>(
  options: Omit<UseGenerate3DModelOptions, 'onResult'> & {
    onResult?: (result: Model3DResult) => TTransformed
  },
): UseGenerate3DModelReturn<
  InferGenerationOutputFromReturn<Model3DResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    // OCTANE DIVERGENCE: identify this binding as Octane (not 'react') in TanStack AI Devtools.
    framework: 'octane',
    hookName: 'useGenerate3DModel',
  }
  const { generate, result, isLoading, error, status, stop, reset } =
    useGeneration<Model3DGenerateInput, Model3DResult, TTransformed>({
      ...options,
      devtools,
    })

  return {
    generate,
    result,
    isLoading,
    error,
    status,
    stop,
    reset,
  }
}
