import { useGeneration } from './use-generation'
import { reconstructTranscriptionResult } from '@tanstack/ai-client'
import type {
  UseGenerationOptions,
  UseGenerationReturn,
} from './use-generation'
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
import type { Accessor } from 'solid-js'

export interface UseTranscriptionOptions<
  TOutput = TranscriptionResult,
> extends Pick<
  UseGenerationOptions<
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

export interface UseTranscriptionReturn<
  TOutput = TranscriptionResult,
> extends Omit<UseGenerationReturn<TOutput>, 'generate'> {
  /** Trigger transcription */
  generate: (input: TranscriptionGenerateInput) => Promise<void>
  /** The transcription result, or null */
  result: Accessor<TOutput | null>
  /** Whether transcription is in progress */
  isLoading: Accessor<boolean>
  /** Current error, if any */
  error: Accessor<Error | undefined>
  /** Current state of the generation */
  status: Accessor<GenerationClientState>
}

export function useTranscription<TTransformed = void>(
  options: Omit<
    UseTranscriptionOptions,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: TranscriptionResult) => TTransformed
  } & GenerationPersistenceOptions,
): UseTranscriptionReturn<
  InferGenerationOutputFromReturn<TranscriptionResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'solid',
    hookName: 'useTranscription',
    outputKind: 'text' as const,
  }
  const generation = useGeneration<
    TranscriptionGenerateInput,
    TranscriptionResult,
    TTransformed
  >({ ...options, devtools, reconstructResult: reconstructTranscriptionResult })

  return generation
}
