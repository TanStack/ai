import { useGeneration } from './use-generation'
import type { AudioGenerationResult, StreamChunk } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  AudioGenerateInput,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  GenerationPendingArtifact,
  GenerationPersistenceOptions,
  GenerationResumeSnapshot,
  GenerationResumeState,
  InferGenerationOutputFromReturn,
} from '@tanstack/ai-client'
import type { PersistedArtifactRef } from '@tanstack/ai/client'

/**
 * Options for the useGenerateAudio hook.
 *
 * @template TOutput - The output type after optional transform (defaults to AudioGenerationResult)
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
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  /** Server-side lightweight generation state persistence. */
  persistence?: GenerationPersistenceOptions
  /** Initial lightweight resume snapshot restored by the app. */
  initialResumeSnapshot?: GenerationResumeSnapshot
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
 * @template TOutput - The output type (after optional transform)
 */
export interface UseGenerateAudioReturn<TOutput = AudioGenerationResult> {
  /** Trigger audio generation */
  generate: (input: AudioGenerateInput) => Promise<void>
  /** The generation result containing audio, or null */
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
  /** Lightweight generation resume snapshot, if one is available */
  resumeSnapshot: GenerationResumeSnapshot | undefined
  /** Current resumable run/cursor state, if one is available */
  resumeState: GenerationResumeState | null
  /** Pending persisted artifact references observed during generation/replay */
  pendingArtifacts: Array<GenerationPendingArtifact>
  /** Final persisted artifact references observed from a replayed result */
  resultArtifacts: Array<PersistedArtifactRef>
}

/**
 * React hook for generating audio (music, sound effects) using AI models.
 *
 * Supports two transport modes:
 * - **ConnectConnectionAdapter** — Streaming transport (SSE, HTTP stream, custom)
 * - **Fetcher** — Direct async function call
 *
 * @example
 * ```tsx
 * import { useGenerateAudio } from '@tanstack/ai-react'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 *
 * function AudioGenerator() {
 *   const { generate, result, isLoading, error, reset } = useGenerateAudio({
 *     connection: fetchServerSentEvents('/api/generate/audio'),
 *   })
 *
 *   return (
 *     <div>
 *       <button onClick={() => generate({ prompt: 'An upbeat electronic track', duration: 10 })}>
 *         Generate
 *       </button>
 *       {isLoading && <p>Generating...</p>}
 *       {error && <p>Error: {error.message}</p>}
 *       {result?.audio.url && <audio src={result.audio.url} controls />}
 *     </div>
 *   )
 * }
 * ```
 */
export function useGenerateAudio<TTransformed = void>(
  options: Omit<UseGenerateAudioOptions, 'onResult'> & {
    onResult?: (result: AudioGenerationResult) => TTransformed
  },
): UseGenerateAudioReturn<
  InferGenerationOutputFromReturn<AudioGenerationResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'react',
    hookName: 'useGenerateAudio',
    outputKind: 'audio' as const,
  }
  const generation = useGeneration<
    AudioGenerateInput,
    AudioGenerationResult,
    TTransformed
  >({
    ...options,
    devtools,
  })

  return {
    ...generation,
    generate: generation.generate as (
      input: AudioGenerateInput,
    ) => Promise<void>,
  }
}
