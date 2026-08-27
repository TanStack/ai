import { useGeneration } from './use-generation'
import { reconstructSpeechResult } from '@tanstack/ai-client'
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
  GenerationPersistenceOptions,
  InferGenerationOutputFromReturn,
  SpeechGenerateInput,
} from '@tanstack/ai-client'
import type { DeepReadonly, ShallowRef } from 'vue'

export interface UseGenerateSpeechOptions<TOutput = TTSResult> extends Pick<
  UseGenerationOptions<SpeechGenerateInput, TTSResult, TOutput>,
  | 'persistence'
  | 'threadId'
  | 'hydrateGeneration'
  | 'joinRun'
  | 'byok'
  | 'byokProvider'
> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for speech generation */
  fetcher?: GenerationFetcher<SpeechGenerateInput, TTSResult>
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  onResult?: (result: TTSResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

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

export function useGenerateSpeech<TTransformed = void>(
  options: Omit<
    UseGenerateSpeechOptions,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: TTSResult) => TTransformed
  } & GenerationPersistenceOptions,
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
    reconstructResult: reconstructSpeechResult,
  })

  return generation
}
