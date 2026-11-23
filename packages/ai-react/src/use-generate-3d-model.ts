import { useGenerationWithDevtoolsIdentity } from './use-generation'
import type { Model3dResult, StreamChunk } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutputFromReturn,
  Model3dGenerateInput,
} from '@tanstack/ai-client'
import type { ByokClient } from '@tanstack/ai-client/byok'
import type { ProviderId } from '@tanstack/ai/byok'

/**
 * Options for the useGenerate3dModel hook.
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 *
 * @template TOutput - The output type after optional transform (defaults to Model3dResult)
 */
export interface UseGenerate3dModelOptions<TOutput = Model3dResult> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for 3D model generation */
  fetcher?: GenerationFetcher<Model3dGenerateInput, Model3dResult>
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
  /** Optional BYOK keyring. Keys go in `x-byok-*` headers, never the body. */
  byok?: ByokClient
  /** Optional provider id. If it returns a slug, only that key is sent. If no slug resolves (`byokProvider`, then `body.provider`), generate throws. */
  byokProvider?: () => ProviderId | undefined
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  /**
   * The **scope** this generation belongs to: a stable, app-chosen name for the
   * slot successive runs fill. It is not a link to a chat conversation.
   *
   * Each run gets its own `runId`, but all runs belong to one scope. It is
   * also sent as the AG-UI thread id on the wire.
   */
  threadId: string
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
   * Callback for each provider poll. `progress` is 0-100. `message` is the
   * job state (`'pending'`, `'processing'` or `'completed'`).
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
 * @template TOutput - The output type (after optional transform)
 */
export interface UseGenerate3dModelReturn<TOutput = Model3dResult> {
  /** Start 3D model generation */
  generate: (input: Model3dGenerateInput) => Promise<void>
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
  /**
   * The id of the generation job currently running, or `null` when nothing is in
   * flight. `stop()` only aborts the local stream. It does not stop work
   * already running on the provider.
   */
  runId: string | null
}

/**
 * React hook for generating 3D models (text-to-3D, image-to-3D, 3D-to-3D).
 *
 * Supports two transport modes:
 * - **ConnectConnectionAdapter**: streaming transport (SSE, HTTP stream, custom)
 * - **Fetcher**: direct async function call
 *
 * The server streams a `generation:progress` event for each provider poll and
 * one `generation:result` event with the finished model.
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 *
 * @example
 * ```tsx
 * import { useGenerate3dModel } from '@tanstack/ai-react'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 *
 * function ModelGenerator() {
 *   const { generate, result, isLoading, error } = useGenerate3dModel({
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
 *
 * @example
 * ```tsx
 * // Fetcher form: call a server function that returns a Model3dResult.
 * const { generate, result } = useGenerate3dModel({
 *   threadId: 'hero-model',
 *   fetcher: (input) => generateModelFn({ data: input }),
 * })
 * ```
 */
export function useGenerate3dModel<TTransformed = void>(
  options: Omit<UseGenerate3dModelOptions, 'onResult'> & {
    onResult?: (result: Model3dResult) => TTransformed
  },
): UseGenerate3dModelReturn<
  InferGenerationOutputFromReturn<Model3dResult, TTransformed>
> {
  return useGenerationWithDevtoolsIdentity<
    Model3dGenerateInput,
    Model3dResult,
    TTransformed
  >(
    // 3D results are never persisted, even if an untyped caller sets it.
    { ...options, persistence: false },
    { hookName: 'useGenerate3dModel' },
  )
}
