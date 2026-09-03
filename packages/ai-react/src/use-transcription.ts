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
import type { ByokClient, ByokProviderSelector } from '@tanstack/ai-client/byok'

/**
 * Options for the useTranscription hook.
 *
 * @template TOutput - The output type after optional transform (defaults to TranscriptionResult)
 */
export interface UseTranscriptionOptions<TOutput = TranscriptionResult> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for transcription */
  fetcher?: GenerationFetcher<TranscriptionGenerateInput, TranscriptionResult>
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
  /** Optional BYOK keyring. Keys go in `x-byok-*` headers, never the body. */
  byok?: ByokClient
  /** Optional provider id, or several for grouped credentials. If it returns a slug, only that key is sent. If no slug resolves (`byokProvider`, then `body.provider`), generate throws. */
  byokProvider?: ByokProviderSelector
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
   * Callback when transcription is complete. Can optionally return a transformed value.
   *
   * - Return a non-null value to transform and store it as the result
   * - Return `null` to keep the previous result unchanged
   * - Return nothing (`void`) to store the raw result as-is
   */
  onResult?: (result: TranscriptionResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

/**
 * Return type for the useTranscription hook.
 *
 * @template TOutput - The output type (after optional transform)
 */
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
  /**
   * The id of the generation job currently running, or `null` when nothing is in
   * flight. Each call to `generate` is one job with its own id. Pass it to your
   * own endpoint to cancel or poll the provider job — `stop()` only aborts the
   * local stream, it does not stop work already running on the provider.
   */
  runId: string | null
}

/**
 * React hook for transcribing audio to text using AI models.
 *
 * @example
 * ```tsx
 * import { useTranscription } from '@tanstack/ai-react'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 *
 * function Transcriber() {
 *   const { generate, result, isLoading } = useTranscription({
 *     connection: fetchServerSentEvents('/api/transcribe'),
 *   })
 *
 *   const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
 *     const file = e.target.files?.[0]
 *     if (file) {
 *       const reader = new FileReader()
 *       reader.onload = () => {
 *         generate({ audio: reader.result as string, language: 'en' })
 *       }
 *       reader.readAsDataURL(file)
 *     }
 *   }
 *
 *   return (
 *     <div>
 *       <input type="file" accept="audio/*" onChange={handleFile} />
 *       {isLoading && <p>Transcribing...</p>}
 *       {result && <p>{result.text}</p>}
 *     </div>
 *   )
 * }
 * ```
 */
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
