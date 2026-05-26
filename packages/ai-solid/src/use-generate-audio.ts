import { useGeneration } from './use-generation'
import type { AudioGenerationResult, StreamChunk } from '@tanstack/ai'
import type {
  AudioGenerateInput,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutput,
} from '@tanstack/ai-client'
import type { Accessor } from 'solid-js'

/**
 * Options for the useGenerateAudio hook.
 *
 * @template TOutput - The transformed output type (defaults to AudioGenerationResult)
 */
export interface UseGenerateAudioOptions<TOutput = AudioGenerationResult> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for audio generation */
  fetcher?: GenerationFetcher<AudioGenerateInput, AudioGenerationResult>
  /** Unique identifier for this generation instance */
  id?: string
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
  /**
   * Callback when audio is generated. Can optionally return a transformed value.
   *
   * - Return a non-null value to transform and store it as the result
   * - Return `null` to keep the previous result unchanged
   * - Return nothing (`void`) to store the raw result as-is
   */
  onResult?: (result: AudioGenerationResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

/**
 * Return type for the useGenerateAudio hook.
 *
 * @template TOutput - The transformed output type (defaults to AudioGenerationResult)
 */
export interface UseGenerateAudioReturn<TOutput = AudioGenerationResult> {
  /** Trigger audio generation */
  generate: (input: AudioGenerateInput) => Promise<void>
  /** The generation result containing audio, or null */
  result: Accessor<TOutput | null>
  /** Whether generation is in progress */
  isLoading: Accessor<boolean>
  /** Current error, if any */
  error: Accessor<Error | undefined>
  /** Current state of the generation */
  status: Accessor<GenerationClientState>
  /** Abort the current generation */
  stop: () => void
  /** Clear result, error, and return to idle */
  reset: () => void
}

/**
 * Solid hook for generating audio (music, sound effects) using AI models.
 *
 * @example
 * ```tsx
 * import { useGenerateAudio } from '@tanstack/ai-solid'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 *
 * function AudioGenerator() {
 *   const { generate, result, isLoading } = useGenerateAudio({
 *     connection: fetchServerSentEvents('/api/generate/audio'),
 *   })
 *
 *   return (
 *     <div>
 *       <button onClick={() => generate({ prompt: 'An upbeat electronic track', duration: 10 })}>
 *         Generate
 *       </button>
 *       {result()?.audio.url && <audio src={result()!.audio.url} controls />}
 *     </div>
 *   )
 * }
 * ```
 */
export function useGenerateAudio<
  TOnResult extends ((result: AudioGenerationResult) => any) | undefined =
    undefined,
>(
  options: Omit<UseGenerateAudioOptions, 'onResult'> & {
    onResult?: TOnResult
  },
): UseGenerateAudioReturn<
  InferGenerationOutput<AudioGenerationResult, TOnResult>
> {
  const { generate, result, isLoading, error, status, stop, reset } =
    useGeneration<AudioGenerateInput, AudioGenerationResult, TOnResult>(options)

  return {
    generate: generate as (input: AudioGenerateInput) => Promise<void>,
    result,
    isLoading,
    error,
    status,
    stop,
    reset,
  }
}
