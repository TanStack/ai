import { injectGeneration } from './inject-generation'
import { reconstructAudioResult } from '@tanstack/ai-client'
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
import type { Signal } from '@angular/core'
import type { ReactiveOption } from './internal/to-reactive'
import type {
  InjectGenerationOptions,
  InjectGenerationResult,
} from './inject-generation'

export interface InjectGenerateAudioOptions<
  TOutput = AudioGenerationResult,
> extends Pick<
  InjectGenerationOptions<AudioGenerateInput, AudioGenerationResult, TOutput>,
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
  /** Additional body parameters to send with connect-based adapter requests. Reactive. */
  body?: ReactiveOption<Record<string, any>>
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

export interface InjectGenerateAudioResult<
  TOutput = AudioGenerationResult,
> extends Omit<InjectGenerationResult<TOutput>, 'generate'> {
  /** Trigger audio generation */
  generate: (input: AudioGenerateInput) => Promise<void>
  /** The generation result containing audio, or null */
  result: Signal<TOutput | null>
  /** Whether generation is in progress */
  isLoading: Signal<boolean>
  /** Current error, if any */
  error: Signal<Error | undefined>
  /** Current state of the generation */
  status: Signal<GenerationClientState>
}

export function injectGenerateAudio<TTransformed = void>(
  options: Omit<
    InjectGenerateAudioOptions,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: AudioGenerationResult) => TTransformed
  } & GenerationPersistenceOptions,
): InjectGenerateAudioResult<
  InferGenerationOutputFromReturn<AudioGenerationResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'angular',
    hookName: 'injectGenerateAudio',
    outputKind: 'audio' as const,
  }
  const generation = injectGeneration<
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
