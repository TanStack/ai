import { useGeneration } from './use-generation'
import { reconstructAudioResult } from '@tanstack/ai-client'
import type {
  UseGenerationOptions,
  UseGenerationReturn,
} from './use-generation'
import type { AudioGenerationResult, StreamChunk } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  AudioGenerateInput,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  GenerationPersistenceOptions,
  InferGenerationOutputFromReturn,
} from '@tanstack/ai-client'
import type { Accessor } from 'solid-js'

export interface UseGenerateAudioOptions<
  TOutput = AudioGenerationResult,
> extends Pick<
  UseGenerationOptions<AudioGenerateInput, AudioGenerationResult, TOutput>,
  | 'persistence'
  | 'threadId'
  | 'hydrateGeneration'
  | 'joinRun'
  | 'byok'
  | 'byokProvider'
> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for audio generation */
  fetcher?: GenerationFetcher<AudioGenerateInput, AudioGenerationResult>
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  onResult?: (result: AudioGenerationResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

export interface UseGenerateAudioReturn<
  TOutput = AudioGenerationResult,
> extends Omit<UseGenerationReturn<TOutput>, 'generate'> {
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
}

export function useGenerateAudio<TTransformed = void>(
  options: Omit<
    UseGenerateAudioOptions,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: AudioGenerationResult) => TTransformed
  } & GenerationPersistenceOptions,
): UseGenerateAudioReturn<
  InferGenerationOutputFromReturn<AudioGenerationResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'solid',
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
    reconstructResult: reconstructAudioResult,
  })

  return generation
}
