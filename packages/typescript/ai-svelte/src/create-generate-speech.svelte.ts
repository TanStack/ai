import { createGeneration } from './create-generation.svelte'
import type { StreamChunk, TTSResult } from '@tanstack/ai'
import type {
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutput,
  SpeechGenerateInput,
} from '@tanstack/ai-client'

/**
 * Options for the createGenerateSpeech function.
 *
 * @template TOutput - The output type after optional transform (defaults to TTSResult)
 */
export interface CreateGenerateSpeechOptions<TOutput = TTSResult> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for speech generation */
  fetcher?: GenerationFetcher<SpeechGenerateInput, TTSResult>
  /** Unique identifier for this generation instance */
  id?: string
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
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
 * Return type for the createGenerateSpeech function.
 *
 * @template TOutput - The output type (after optional transform)
 */
export interface CreateGenerateSpeechReturn<TOutput = TTSResult> {
  /** The TTS result containing audio data, or null */
  readonly result: TOutput | null
  /** Whether generation is in progress */
  readonly isLoading: boolean
  /** Current error, if any */
  readonly error: Error | undefined
  /** Current state of the generation */
  readonly status: GenerationClientState
  /** Trigger speech generation */
  generate: (input: SpeechGenerateInput) => Promise<void>
  /** Abort the current generation */
  stop: () => void
  /** Clear result, error, and return to idle */
  reset: () => void
  /** Update additional body parameters */
  updateBody: (body: Record<string, any>) => void
}

/**
 * Creates a reactive speech generation (text-to-speech) instance for Svelte 5.
 *
 * @example
 * ```svelte
 * <script>
 *   import { createGenerateSpeech, fetchServerSentEvents } from '@tanstack/ai-svelte'
 *
 *   const speech = createGenerateSpeech({
 *     connection: fetchServerSentEvents('/api/generate/speech'),
 *   })
 * </script>
 *
 * <div>
 *   <button onclick={() => speech.generate({ text: 'Hello world', voice: 'alloy' })}>
 *     Generate Speech
 *   </button>
 *   {#if speech.isLoading}
 *     <p>Generating...</p>
 *   {/if}
 *   {#if speech.result}
 *     <audio src={`data:audio/${speech.result.format};base64,${speech.result.audio}`} controls></audio>
 *   {/if}
 * </div>
 * ```
 */
export function createGenerateSpeech<
  TOnResult extends ((result: TTSResult) => any) | undefined = undefined,
>(
  options: Omit<CreateGenerateSpeechOptions, 'onResult'> & {
    onResult?: TOnResult
  },
): CreateGenerateSpeechReturn<InferGenerationOutput<TTSResult, TOnResult>> {
  const gen = createGeneration<SpeechGenerateInput, TTSResult, TOnResult>(
    options,
  )

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
    generate: gen.generate as (input: SpeechGenerateInput) => Promise<void>,
    stop: gen.stop,
    reset: gen.reset,
    updateBody: gen.updateBody,
  }
}
