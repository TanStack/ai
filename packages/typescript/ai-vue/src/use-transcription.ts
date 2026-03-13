import { useGeneration } from './use-generation'
import type { StreamChunk, TranscriptionResult } from '@tanstack/ai'
import type {
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutput,
  TranscriptionGenerateInput,
} from '@tanstack/ai-client'
import type { DeepReadonly, ShallowRef } from 'vue'

/**
 * Options for the useTranscription composable.
 *
 * @template TOutput - The output type after optional transform (defaults to TranscriptionResult)
 */
export interface UseTranscriptionOptions<TOutput = TranscriptionResult> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for transcription */
  fetcher?: GenerationFetcher<TranscriptionGenerateInput, TranscriptionResult>
  /** Unique identifier for this generation instance */
  id?: string
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
  /**
   * Callback when transcription is complete. Can optionally return a transformed value.
   *
   * - Return a non-null value to transform and store it as the result
   * - Return `null` to keep the previous result unchanged
   * - Return nothing (`void`) to store the raw result as-is
   */
  onResult?: (result: TranscriptionResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

/**
 * Return type for the useTranscription composable.
 *
 * @template TOutput - The output type (after optional transform)
 */
export interface UseTranscriptionReturn<TOutput = TranscriptionResult> {
  /** Trigger transcription */
  generate: (input: TranscriptionGenerateInput) => Promise<void>
  /** The transcription result, or null */
  result: DeepReadonly<ShallowRef<TOutput | null>>
  /** Whether transcription is in progress */
  isLoading: DeepReadonly<ShallowRef<boolean>>
  /** Current error, if any */
  error: DeepReadonly<ShallowRef<Error | undefined>>
  /** Current state of the generation */
  status: DeepReadonly<ShallowRef<GenerationClientState>>
  /** Abort the current transcription */
  stop: () => void
  /** Clear result, error, and return to idle */
  reset: () => void
}

/**
 * Vue composable for transcribing audio to text using AI models.
 *
 * @example
 * ```vue
 * <script setup>
 * import { useTranscription } from '@tanstack/ai-vue'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 *
 * const { generate, result, isLoading } = useTranscription({
 *   connection: fetchServerSentEvents('/api/transcribe'),
 * })
 *
 * const handleFile = (e: Event) => {
 *   const file = (e.target as HTMLInputElement).files?.[0]
 *   if (file) {
 *     const reader = new FileReader()
 *     reader.onload = () => {
 *       generate({ audio: reader.result as string, language: 'en' })
 *     }
 *     reader.readAsDataURL(file)
 *   }
 * }
 * </script>
 *
 * <template>
 *   <div>
 *     <input type="file" accept="audio/*" @change="handleFile" />
 *     <p v-if="isLoading">Transcribing...</p>
 *     <p v-if="result">{{ result.text }}</p>
 *   </div>
 * </template>
 * ```
 */
export function useTranscription<
  TOnResult extends ((result: TranscriptionResult) => any) | undefined =
    undefined,
>(
  options: Omit<UseTranscriptionOptions, 'onResult'> & {
    onResult?: TOnResult
  },
): UseTranscriptionReturn<
  InferGenerationOutput<TranscriptionResult, TOnResult>
> {
  const { generate, result, isLoading, error, status, stop, reset } =
    useGeneration<TranscriptionGenerateInput, TranscriptionResult, TOnResult>(
      options,
    )

  return {
    generate: generate as (input: TranscriptionGenerateInput) => Promise<void>,
    result,
    isLoading,
    error,
    status,
    stop,
    reset,
  }
}
