import { useGeneration } from './use-generation'
import { reconstructTranscriptionResult } from '@tanstack/ai-client'
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
import type { ByokClient } from '@tanstack/ai-client/byok'
import type { ProviderId } from '@tanstack/ai/byok'

export interface UseTranscriptionOptions<TOutput = TranscriptionResult> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for transcription */
  fetcher?: GenerationFetcher<TranscriptionGenerateInput, TranscriptionResult>
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
  /** Optional BYOK keyring. Keys go in `x-byok-*` headers, never the body. */
  byok?: ByokClient
  /** Optional provider id. If it returns a slug, only that key is sent. If no slug resolves (`byokProvider`, then `body.provider`), generate throws. */
  byokProvider?: () => ProviderId | undefined
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  persistence?: boolean
  threadId?: string
  hydrateGeneration?: ConnectConnectionAdapter['hydrateGeneration']
  joinRun?: ConnectConnectionAdapter['joinRun']
  onResult?: (result: TranscriptionResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

export interface UseTranscriptionReturn<TOutput = TranscriptionResult> {
  /** Trigger transcription */
  generate: (input: TranscriptionGenerateInput) => Promise<void>
  /** The transcription result, or null */
  result: TOutput | null
  /** Whether transcription is in progress */
  isLoading: boolean
  /** Current error, if any */
  error: Error | undefined
  /** Current state of the generation */
  status: GenerationClientState
  /** Abort the current transcription */
  stop: () => void
  /** Clear result, error, and return to idle */
  reset: () => void
  runId: string | null
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
    framework: 'react',
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
