import { createGeneration } from './create-generation.svelte'
import { reconstructSpeechResult } from '@tanstack/ai-client'
import type {
  CreateGenerationOptions,
  CreateGenerationReturn,
} from './create-generation.svelte'
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

export interface CreateGenerateSpeechOptions<TOutput = TTSResult> extends Pick<
  CreateGenerationOptions<SpeechGenerateInput, TTSResult, TOutput>,
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

export interface CreateGenerateSpeechReturn<TOutput = TTSResult> extends Omit<
  CreateGenerationReturn<TOutput>,
  'generate'
> {
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
}

export function createGenerateSpeech<TTransformed = void>(
  options: Omit<
    CreateGenerateSpeechOptions,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: TTSResult) => TTransformed
  } & GenerationPersistenceOptions,
): CreateGenerateSpeechReturn<
  InferGenerationOutputFromReturn<TTSResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'svelte',
    hookName: 'createGenerateSpeech',
    outputKind: 'audio' as const,
  }
  const gen = createGeneration<SpeechGenerateInput, TTSResult, TTransformed>({
    ...options,
    devtools,
    reconstructResult: reconstructSpeechResult,
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
