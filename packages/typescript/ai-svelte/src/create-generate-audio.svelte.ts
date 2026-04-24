import { createGeneration } from './create-generation.svelte'
import type { AudioGenerationResult, StreamChunk } from '@tanstack/ai'
import type {
  AudioGenerateInput,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutput,
} from '@tanstack/ai-client'

/**
 * Options for the createGenerateAudio function.
 *
 * @template TOutput - The output type after optional transform (defaults to AudioGenerationResult)
 */
export interface CreateGenerateAudioOptions<TOutput = AudioGenerationResult> {
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
 * Return type for the createGenerateAudio function.
 *
 * @template TOutput - The output type (after optional transform)
 */
export interface CreateGenerateAudioReturn<TOutput = AudioGenerationResult> {
  /** The generation result containing audio, or null */
  readonly result: TOutput | null
  /** Whether generation is in progress */
  readonly isLoading: boolean
  /** Current error, if any */
  readonly error: Error | undefined
  /** Current state of the generation */
  readonly status: GenerationClientState
  /** Trigger audio generation */
  generate: (input: AudioGenerateInput) => Promise<void>
  /** Abort the current generation */
  stop: () => void
  /** Clear result, error, and return to idle */
  reset: () => void
  /** Update additional body parameters */
  updateBody: (body: Record<string, any>) => void
}

/**
 * Creates a reactive audio generation instance for Svelte 5.
 *
 * @example
 * ```svelte
 * <script>
 *   import { createGenerateAudio, fetchServerSentEvents } from '@tanstack/ai-svelte'
 *
 *   const audio = createGenerateAudio({
 *     connection: fetchServerSentEvents('/api/generate/audio'),
 *   })
 * </script>
 *
 * <div>
 *   <button onclick={() => audio.generate({ prompt: 'An upbeat electronic track', duration: 10 })}>
 *     Generate
 *   </button>
 *   {#if audio.isLoading}
 *     <p>Generating...</p>
 *   {/if}
 *   {#if audio.result?.audio.url}
 *     <audio src={audio.result.audio.url} controls></audio>
 *   {/if}
 * </div>
 * ```
 */
export function createGenerateAudio<
  TOnResult extends ((result: AudioGenerationResult) => any) | undefined =
    undefined,
>(
  options: Omit<CreateGenerateAudioOptions, 'onResult'> & {
    onResult?: TOnResult
  },
): CreateGenerateAudioReturn<
  InferGenerationOutput<AudioGenerationResult, TOnResult>
> {
  const gen = createGeneration<
    AudioGenerateInput,
    AudioGenerationResult,
    TOnResult
  >(options)

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
    generate: gen.generate as (input: AudioGenerateInput) => Promise<void>,
    stop: gen.stop,
    reset: gen.reset,
    updateBody: gen.updateBody,
  }
}
