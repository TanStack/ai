import { useGeneration } from './use-generation'
import type {
  UseGenerationOptions,
  UseGenerationReturn,
} from './use-generation'
import type { StreamChunk, TTSResult } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutputFromReturn,
  SpeechGenerateInput,
} from '@tanstack/ai-client'
import type { DeepReadonly, ShallowRef } from 'vue'

/**
 * Options for the useGenerateSpeech composable.
 *
 * @template TOutput - The output type after optional transform (defaults to TTSResult)
 */
export interface UseGenerateSpeechOptions<TOutput = TTSResult> extends Pick<
  UseGenerationOptions<SpeechGenerateInput, TTSResult, TOutput>,
  'persistence' | 'initialResumeSnapshot'
> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for speech generation */
  fetcher?: GenerationFetcher<SpeechGenerateInput, TTSResult>
  /** Unique identifier for this generation instance */
  id?: string
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  /**
   * Callback when speech is generated. Can optionally return a transformed value.
   *
   * - Return a non-null value to transform and store it as the result
   * - Return `null` to keep the previous result unchanged
   * - Return nothing (`void`) to store the raw result as-is
   */
  onResult?: (result: TTSResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

/**
 * Return type for the useGenerateSpeech composable.
 *
 * @template TOutput - The output type (after optional transform)
 */
export interface UseGenerateSpeechReturn<TOutput = TTSResult> extends Omit<
  UseGenerationReturn<TOutput>,
  'generate'
> {
  /** Trigger speech generation */
  generate: (input: SpeechGenerateInput) => Promise<void>
  /** The TTS result containing audio data, or null */
  result: DeepReadonly<ShallowRef<TOutput | null>>
  /** Whether generation is in progress */
  isLoading: DeepReadonly<ShallowRef<boolean>>
  /** Current error, if any */
  error: DeepReadonly<ShallowRef<Error | undefined>>
  /** Current state of the generation */
  status: DeepReadonly<ShallowRef<GenerationClientState>>
}

/**
 * Vue composable for generating speech (text-to-speech) using AI models.
 *
 * @example
 * ```vue
 * <script setup>
 * import { useGenerateSpeech } from '@tanstack/ai-vue'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 *
 * const { generate, result, isLoading } = useGenerateSpeech({
 *   connection: fetchServerSentEvents('/api/generate/speech'),
 * })
 * </script>
 *
 * <template>
 *   <div>
 *     <button @click="generate({ text: 'Hello world', voice: 'alloy' })">
 *       Generate Speech
 *     </button>
 *     <audio
 *       v-if="result"
 *       :src="`data:audio/${result.format};base64,${result.audio}`"
 *       controls
 *     />
 *   </div>
 * </template>
 * ```
 */
export function useGenerateSpeech<TTransformed = void>(
  options: Omit<UseGenerateSpeechOptions, 'onResult'> & {
    onResult?: (result: TTSResult) => TTransformed
  },
): UseGenerateSpeechReturn<
  InferGenerationOutputFromReturn<TTSResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'vue',
    hookName: 'useGenerateSpeech',
    outputKind: 'audio' as const,
  }
  const generation = useGeneration<
    SpeechGenerateInput,
    TTSResult,
    TTransformed
  >({
    ...options,
    devtools,
  })

  return {
    ...generation,
    generate: generation.generate as (
      input: SpeechGenerateInput,
    ) => Promise<void>,
  }
}
