import { useGeneration } from './use-generation'
import { reconstructSpeechResult } from '@tanstack/ai-client'
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
import type { ByokClient } from '@tanstack/ai-client/byok'
import type { ProviderId } from '@tanstack/ai/byok'

export interface UseGenerateSpeechOptions<TOutput = TTSResult> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for speech generation */
  fetcher?: GenerationFetcher<SpeechGenerateInput, TTSResult>
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
  onResult?: (result: TTSResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

export interface UseGenerateSpeechReturn<TOutput = TTSResult> {
  /** Trigger speech generation */
  generate: (input: SpeechGenerateInput) => Promise<void>
  /** The TTS result containing audio data, or null */
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
  runId: string | null
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
    framework: 'react',
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
