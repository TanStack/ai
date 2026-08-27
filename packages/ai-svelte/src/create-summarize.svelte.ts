import { createGeneration } from './create-generation.svelte'
import { reconstructSummarizeResult } from '@tanstack/ai-client'
import type {
  CreateGenerationOptions,
  CreateGenerationReturn,
} from './create-generation.svelte'
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

export interface CreateSummarizeOptions<
  TOutput = SummarizationResult,
> extends Pick<
  CreateGenerationOptions<SummarizeGenerateInput, SummarizationResult, TOutput>,
  | 'persistence'
  | 'threadId'
  | 'hydrateGeneration'
  | 'joinRun'
  | 'byok'
  | 'byokProvider'
> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for summarization */
  fetcher?: GenerationFetcher<SummarizeGenerateInput, SummarizationResult>
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  onResult?: (result: SummarizationResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

export interface CreateSummarizeReturn<
  TOutput = SummarizationResult,
> extends Omit<CreateGenerationReturn<TOutput>, 'generate'> {
  /** The summarization result, or null */
  readonly result: TOutput | null
  /** Whether summarization is in progress */
  readonly isLoading: boolean
  /** Current error, if any */
  readonly error: Error | undefined
  /** Current state of the generation */
  readonly status: GenerationClientState
  /** Trigger summarization */
  generate: (input: SummarizeGenerateInput) => Promise<void>
}

export function createSummarize<TTransformed = void>(
  options: Omit<
    CreateSummarizeOptions,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: SummarizationResult) => TTransformed
  } & GenerationPersistenceOptions,
): CreateSummarizeReturn<
  InferGenerationOutputFromReturn<SummarizationResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'svelte',
    hookName: 'createSummarize',
    outputKind: 'text' as const,
  }
  const gen = createGeneration<
    SummarizeGenerateInput,
    SummarizationResult,
    TTransformed
  >({
    ...options,
    devtools,
    reconstructResult: reconstructSummarizeResult,
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
