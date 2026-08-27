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

/**
 * Options for the useSummarize hook.
 *
 * @template TOutput - The output type after optional transform (defaults to SummarizationResult)
 */
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
  /**
     * How this generation persists across reloads.
     * - Omit / `false`: ephemeral, in-memory only.
     * - `true`: server-driven — on mount the client hydrates the last generation
     *   for its `threadId` from the server (needs a connection with a
     *   `hydrateGeneration` handler) and repaints it; it never auto-starts a run.
     */
  persistence?: boolean
  /**
     * The **scope** this generation belongs to: a stable, app-chosen name for the
     * slot successive runs fill — not a link to a chat conversation.
     *
     * The hook starts empty and produces many runs over its life; each gets its
     * own `runId`, but all belong to one scope. Persistence keys on this, so
     * derive it from your own domain and keep it identical across reloads (e.g.
     * `` `video-${videoId}-start-frame` ``). It is also sent as the AG-UI thread
     * id on the wire, which the protocol requires.
     *
     * **Required whenever `persistence` is set** — an app that cannot name the
     * scope has nothing to restore to. Optional for ephemeral generations. If
     * omitted, the client mints a wire id after mount.
     */
  threadId?: string
  /**
     * Server-driven hydration handler for `persistence: true` when the
     * connection doesn't carry one (e.g. alongside `fetcher`, or a `stream()` /
     * `rpcStream()` adapter built without handlers) — typically a one-line
     * server-function call. The connection's own handler takes precedence.
     */
  hydrateGeneration?: ConnectConnectionAdapter['hydrateGeneration']
  /**
     * Re-attach handler that replays a run still generating to completion on
     * mount, when the connection doesn't carry one. Without it, a restored
     * `running` snapshot surfaces as an (interrupted) error. The connection's
     * own handler takes precedence.
     */
  joinRun?: ConnectConnectionAdapter['joinRun']
  /**
     * Callback when summarization is complete. Can optionally return a transformed value.
     *
     * - Return a non-null value to transform and store it as the result
     * - Return `null` to keep the previous result unchanged
     * - Return nothing (`void`) to store the raw result as-is
     */
  onResult?: (result: SummarizationResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

/**
 * Return type for the useSummarize hook.
 *
 * @template TOutput - The output type (after optional transform)
 */
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
  /**
     * The id of the generation job currently running, or `null` when nothing is in
     * flight. Each call to `generate` is one job with its own id. Pass it to your
     * own endpoint to cancel or poll the provider job — `stop()` only aborts the
     * local stream, it does not stop work already running on the provider.
     */
  runId: string | null
}

/**
 * React hook for summarizing text using AI models.
 *
 * @example
 * ```tsx
 * import { useSummarize } from '@tanstack/ai-react'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 *
 * function Summarizer() {
 *   const { generate, result, isLoading } = useSummarize({
 *     connection: fetchServerSentEvents('/api/summarize'),
 *   })
 *
 *   return (
 *     <div>
 *       <button onClick={() => generate({
 *         text: 'Long article text...',
 *         style: 'bullet-points',
 *         maxLength: 200,
 *       })}>
 *         Summarize
 *       </button>
 *       {isLoading && <p>Summarizing...</p>}
 *       {result && <p>{result.summary}</p>}
 *     </div>
 *   )
 * }
 * ```
 */
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
  /** Display options for TanStack AI Devtools. */
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
