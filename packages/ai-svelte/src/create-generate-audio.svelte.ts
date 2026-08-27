import { createGeneration } from './create-generation.svelte'
import { reconstructAudioResult } from '@tanstack/ai-client'
import type {
  CreateGenerationOptions,
  CreateGenerationReturn,
} from './create-generation.svelte'
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

export interface CreateGenerateAudioOptions<
  TOutput = AudioGenerationResult,
> extends Pick<
  CreateGenerationOptions<AudioGenerateInput, AudioGenerationResult, TOutput>,
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

export interface CreateGenerateAudioReturn<
  TOutput = AudioGenerationResult,
> extends Omit<CreateGenerationReturn<TOutput>, 'generate'> {
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
}

export function createGenerateAudio<TTransformed = void>(
  options: Omit<
    CreateGenerateAudioOptions,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: AudioGenerationResult) => TTransformed
  } & GenerationPersistenceOptions,
): CreateGenerateAudioReturn<
  InferGenerationOutputFromReturn<AudioGenerationResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'svelte',
    hookName: 'createGenerateAudio',
    outputKind: 'audio' as const,
  }
  const gen = createGeneration<
    AudioGenerateInput,
    AudioGenerationResult,
    TTransformed
  >({
    ...options,
    devtools,
    reconstructResult: reconstructAudioResult,
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
    generate: gen.generate,
    stop: gen.stop,
    reset: gen.reset,
    updateBody: gen.updateBody,
    dispose: gen.dispose,
    get runId() {
      return gen.runId
    },
  }
}
