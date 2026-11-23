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
import type { DeepReadonly, ShallowRef } from 'vue'

/**
 * Options for the useGenerate3dModel composable.
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 *
 * @template TOutput - The output type after optional transform (defaults to Model3dResult)
 */
export interface UseGenerate3dModelOptions<
  TOutput = Model3dResult,
> extends Pick<
  UseGenerationOptions<Model3dGenerateInput, Model3dResult, TOutput>,
  'threadId' | 'byok' | 'byokProvider'
> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for 3D model generation */
  fetcher?: GenerationFetcher<Model3dGenerateInput, Model3dResult>
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
  onResult?: (result: Model3dResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /**
   * Callback when the server reports progress (0-100). The message is the
   * job status: `pending`, `processing`, or `completed`.
   */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

/**
 * Return type for the useGenerate3dModel composable.
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 *
 * @template TOutput - The output type (after optional transform)
 */
export interface UseGenerate3dModelReturn<TOutput = Model3dResult> extends Omit<
  UseGenerationReturn<TOutput>,
  'generate'
> {
  /** Trigger 3D model generation */
  generate: (input: Model3dGenerateInput) => Promise<void>
  /** The finished 3D model, or null */
  result: DeepReadonly<ShallowRef<TOutput | null>>
  /** Whether generation is in progress */
  isLoading: DeepReadonly<ShallowRef<boolean>>
  /** Current error, if any */
  error: DeepReadonly<ShallowRef<Error | undefined>>
  /** Current state of the generation */
  status: DeepReadonly<ShallowRef<GenerationClientState>>
}

/**
 * Vue composable for generating 3D models using AI models.
 *
 * The server route runs `generate3dModel()` and streams progress events
 * while the provider job runs, then one result event with the model URL.
 *
 * Supports two transport modes:
 * - **ConnectConnectionAdapter** — Streaming transport (SSE, HTTP stream, custom)
 * - **Fetcher** — Direct async function call
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 *
 * @example
 * ```vue
 * <script setup>
 * import { ref } from 'vue'
 * import { useGenerate3dModel } from '@tanstack/ai-vue'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 *
 * const progress = ref(0)
 * const { generate, result, isLoading, error } = useGenerate3dModel({
 *   connection: fetchServerSentEvents('/api/generate/3d-model'),
 *   onProgress: (value) => {
 *     progress.value = value
 *   },
 * })
 * </script>
 *
 * <template>
 *   <div>
 *     <button @click="generate({ prompt: 'A wooden treasure chest' })">
 *       Generate
 *     </button>
 *     <p v-if="isLoading">Generating... {{ progress }}%</p>
 *     <p v-if="error">Error: {{ error.message }}</p>
 *     <a v-if="result" :href="result.url">Download {{ result.format }}</a>
 *   </div>
 * </template>
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
    framework: 'vue',
    hookName: 'useGenerate3dModel',
  }
  return useGeneration<Model3dGenerateInput, Model3dResult, TTransformed>({
    ...options,
    devtools,
    // 3D results are never persisted, even if an untyped caller sets it.
    persistence: false,
  })
}
