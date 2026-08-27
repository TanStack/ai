import { useGeneration } from './use-generation'
import { reconstructSummarizeResult } from '@tanstack/ai-client'
import type { StreamChunk, SummarizationResult } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  GenerationPersistenceOptions,
  InferGenerationOutputFromReturn,
  SummarizeGenerateInput,
} from '@tanstack/ai-client'
import type { ByokClient } from '@tanstack/ai-client/byok'
import type { ProviderId } from '@tanstack/ai/byok'

export interface UseSummarizeOptions<TOutput = SummarizationResult> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for summarization */
  fetcher?: GenerationFetcher<SummarizeGenerateInput, SummarizationResult>
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
  onResult?: (result: SummarizationResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

export interface UseSummarizeReturn<TOutput = SummarizationResult> {
  /** Trigger summarization */
  generate: (input: SummarizeGenerateInput) => Promise<void>
  /** The summarization result, or null */
  result: TOutput | null
  /** Whether summarization is in progress */
  isLoading: boolean
  /** Current error, if any */
  error: Error | undefined
  /** Current state of the generation */
  status: GenerationClientState
  /** Abort the current summarization */
  stop: () => void
  /** Clear result, error, and return to idle */
  reset: () => void
  runId: string | null
}

export function useSummarize<TTransformed = void>(
  options: Omit<
    UseSummarizeOptions,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: SummarizationResult) => TTransformed
  } & GenerationPersistenceOptions,
): UseSummarizeReturn<
  InferGenerationOutputFromReturn<SummarizationResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'react',
    hookName: 'useSummarize',
    outputKind: 'text' as const,
  }
  const generation = useGeneration<
    SummarizeGenerateInput,
    SummarizationResult,
    TTransformed
  >({
    ...options,
    devtools,
    reconstructResult: reconstructSummarizeResult,
  })

  return generation
}
