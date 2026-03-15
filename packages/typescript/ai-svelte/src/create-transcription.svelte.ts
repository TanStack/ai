import { createGeneration } from './create-generation.svelte'
import type { StreamChunk, TranscriptionResult } from '@tanstack/ai'
import type {
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutput,
  TranscriptionGenerateInput,
} from '@tanstack/ai-client'

/**
 * Options for the createTranscription function.
 *
 * @template TOutput - The output type after optional transform (defaults to TranscriptionResult)
 */
export interface CreateTranscriptionOptions<TOutput = TranscriptionResult> {
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
 * Return type for the createTranscription function.
 *
 * @template TOutput - The output type (after optional transform)
 */
export interface CreateTranscriptionReturn<TOutput = TranscriptionResult> {
  /** The transcription result, or null */
  readonly result: TOutput | null
  /** Whether transcription is in progress */
  readonly isLoading: boolean
  /** Current error, if any */
  readonly error: Error | undefined
  /** Current state of the generation */
  readonly status: GenerationClientState
  /** Trigger transcription */
  generate: (input: TranscriptionGenerateInput) => Promise<void>
  /** Abort the current transcription */
  stop: () => void
  /** Clear result, error, and return to idle */
  reset: () => void
  /** Update additional body parameters */
  updateBody: (body: Record<string, any>) => void
}

/**
 * Creates a reactive audio transcription instance for Svelte 5.
 *
 * @example
 * ```svelte
 * <script>
 *   import { createTranscription, fetchServerSentEvents } from '@tanstack/ai-svelte'
 *
 *   const transcription = createTranscription({
 *     connection: fetchServerSentEvents('/api/transcribe'),
 *   })
 *
 *   function handleFile(e) {
 *     const file = e.target.files?.[0]
 *     if (file) {
 *       const reader = new FileReader()
 *       reader.onload = () => {
 *         transcription.generate({ audio: reader.result, language: 'en' })
 *       }
 *       reader.readAsDataURL(file)
 *     }
 *   }
 * </script>
 *
 * <div>
 *   <input type="file" accept="audio/*" onchange={handleFile} />
 *   {#if transcription.isLoading}
 *     <p>Transcribing...</p>
 *   {/if}
 *   {#if transcription.result}
 *     <p>{transcription.result.text}</p>
 *   {/if}
 * </div>
 * ```
 */
export function createTranscription<
  TOnResult extends ((result: TranscriptionResult) => any) | undefined =
    undefined,
>(
  options: Omit<CreateTranscriptionOptions, 'onResult'> & {
    onResult?: TOnResult
  },
): CreateTranscriptionReturn<
  InferGenerationOutput<TranscriptionResult, TOnResult>
> {
  const gen = createGeneration<
    TranscriptionGenerateInput,
    TranscriptionResult,
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
    generate: gen.generate as (
      input: TranscriptionGenerateInput,
    ) => Promise<void>,
    stop: gen.stop,
    reset: gen.reset,
    updateBody: gen.updateBody,
  }
}
