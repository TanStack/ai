import { useGeneration } from './use-generation'
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
import type { ByokClient } from '@tanstack/ai-client/byok'
import type { ProviderId } from '@tanstack/ai/byok'

export interface UseGenerateAudioOptions<TOutput = AudioGenerationResult> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for audio generation */
  fetcher?: GenerationFetcher<AudioGenerateInput, AudioGenerationResult>
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
  onResult?: (result: AudioGenerationResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

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
  runId: string | null
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
    reconstructResult: reconstructAudioResult,
  })

  return generation
}
