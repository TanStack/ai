import { createGeneration } from './create-generation.svelte'
import type {
  CreateGenerationOptions,
  CreateGenerationReturn,
} from './create-generation.svelte'
import type { StreamChunk, TranscriptionResult } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutputFromReturn,
  TranscriptionGenerateInput,
} from '@tanstack/ai-client'

/**
 * Options for the createTranscription function.
 *
 * @template TOutput - The output type after optional transform (defaults to TranscriptionResult)
 */
export interface CreateTranscriptionOptions<
  TOutput = TranscriptionResult,
> extends Pick<
  CreateGenerationOptions<
    TranscriptionGenerateInput,
    TranscriptionResult,
    TOutput
  >,
  'persistence' | 'initialResumeSnapshot'
> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for transcription */
  fetcher?: GenerationFetcher<TranscriptionGenerateInput, TranscriptionResult>
  /** Unique identifier for this generation instance */
  id?: string
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
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
export interface CreateTranscriptionReturn<
  TOutput = TranscriptionResult,
> extends Omit<CreateGenerationReturn<TOutput>, 'generate'> {
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
export function createTranscription<TTransformed = void>(
  options: Omit<CreateTranscriptionOptions, 'onResult'> & {
    onResult?: (result: TranscriptionResult) => TTransformed
  },
): CreateTranscriptionReturn<
  InferGenerationOutputFromReturn<TranscriptionResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'svelte',
    hookName: 'createTranscription',
    outputKind: 'text' as const,
  }
  const gen = createGeneration<
    TranscriptionGenerateInput,
    TranscriptionResult,
    TTransformed
  >({
    ...options,
    devtools,
  })

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
    dispose: gen.dispose,
    get resumeSnapshot() {
      return gen.resumeSnapshot
    },
    get resumeState() {
      return gen.resumeState
    },
    get pendingArtifacts() {
      return gen.pendingArtifacts
    },
    get resultArtifacts() {
      return gen.resultArtifacts
    },
  }
}
