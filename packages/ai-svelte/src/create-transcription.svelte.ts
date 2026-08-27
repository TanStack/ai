import { createGeneration } from './create-generation.svelte'
import { reconstructTranscriptionResult } from '@tanstack/ai-client'
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
  GenerationPersistenceOptions,
  InferGenerationOutputFromReturn,
  TranscriptionGenerateInput,
} from '@tanstack/ai-client'

export interface CreateTranscriptionOptions<
  TOutput = TranscriptionResult,
> extends Pick<
  CreateGenerationOptions<
    TranscriptionGenerateInput,
    TranscriptionResult,
    TOutput
  >,
  | 'persistence'
  | 'threadId'
  | 'hydrateGeneration'
  | 'joinRun'
  | 'byok'
  | 'byokProvider'
> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for transcription */
  fetcher?: GenerationFetcher<TranscriptionGenerateInput, TranscriptionResult>
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  onResult?: (result: TranscriptionResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

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

export function createTranscription<TTransformed = void>(
  options: Omit<
    CreateTranscriptionOptions,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: TranscriptionResult) => TTransformed
  } & GenerationPersistenceOptions,
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
    reconstructResult: reconstructTranscriptionResult,
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
