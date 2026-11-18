import { useGeneration } from './use-generation'
import type {
  UseGenerationOptions,
  UseGenerationReturn,
} from './use-generation'
import type { Model3DResult, StreamChunk } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutputFromReturn,
  Model3DGenerateInput,
} from '@tanstack/ai-client'
import type { DeepReadonly, ShallowRef } from 'vue'

/**
 * Options for the useGenerate3DModel composable.
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 *
 * @template TOutput - The output type after optional transform (defaults to Model3DResult)
 */
export interface UseGenerate3DModelOptions<
  TOutput = Model3DResult,
> extends Pick<
  UseGenerationOptions<Model3DGenerateInput, Model3DResult, TOutput>,
  | 'threadId'
  | 'byok'
  | 'byokProvider'
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
   * Callback when the server reports progress (0-100). The message is the
   * job status: `pending`, `processing`, or `completed`.
   */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

/**
 * Return type for the useGenerate3DModel composable.
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 *
 * @template TOutput - The output type (after optional transform)
 */
export interface UseGenerate3DModelReturn<TOutput = Model3DResult> extends Omit<
  UseGenerationReturn<TOutput>,
  'generate'
> {
  /** Trigger 3D model generation */
  generate: (input: Model3DGenerateInput) => Promise<void>
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
 * The server route runs `generate3DModel()` and streams progress events
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
 * import { useGenerate3DModel } from '@tanstack/ai-vue'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 *
 * const progress = ref(0)
 * const { generate, result, isLoading, error } = useGenerate3DModel({
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
export function useGenerate3DModel<TTransformed = void>(
  options: Omit<UseGenerate3DModelOptions, 'onResult'> & {
    onResult?: (result: Model3DResult) => TTransformed
  },
): UseGenerate3DModelReturn<
  InferGenerationOutputFromReturn<Model3DResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'vue',
    hookName: 'useGenerate3DModel',
  }
  return useGeneration<Model3DGenerateInput, Model3DResult, TTransformed>({
    ...options,
    devtools,
  })
}
