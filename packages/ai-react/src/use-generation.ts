import { GenerationClient } from '@tanstack/ai-client'
import { createGenerationDevtoolsBridge } from '@tanstack/ai-client/devtools'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { StreamChunk } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ConnectConnectionAdapter,
  GenerationClientOptions,
  GenerationClientState,
  GenerationFetcher,
  GenerationPendingArtifact,
  GenerationPersistenceOptions,
  GenerationResumeSnapshot,
  GenerationResumeState,
  InferGenerationOutputFromReturn,
} from '@tanstack/ai-client'
import type { PersistedArtifactRef } from '@tanstack/ai/client'

/**
 * Options for the useGeneration hook.
 *
 * Accepts either a `connection` (streaming transport) or a `fetcher` (direct async call).
 *
 * @template TInput - The input type for the generation request
 * @template TResult - The result type returned by the generation
 * @template TOutput - The output type after optional transform (defaults to TResult)
 */
export interface UseGenerationOptions<TInput, TResult, TOutput = TResult> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for one-shot generation (no streaming protocol needed) */
  fetcher?: GenerationFetcher<TInput, TResult>
  /** Unique identifier for this generation instance */
  id?: string
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  /** Server-side lightweight generation state persistence. */
  persistence?: GenerationPersistenceOptions
  /** Initial lightweight resume snapshot restored by the app (read-only state). */
  initialResumeSnapshot?: GenerationResumeSnapshot
  /**
   * Callback when a result is received. Can optionally return a transformed value.
   *
   * - Return a non-null value to transform and store it as the result
   * - Return `null` to keep the previous result unchanged
   * - Return nothing (`void`) to store the raw result as-is
   */
  onResult?: (result: TResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

/**
 * Return type for the useGeneration hook.
 *
 * @template TOutput - The output type (after optional transform)
 */
export interface UseGenerationReturn<TOutput> {
  /** Trigger a generation request */
  generate: (input: Record<string, any>) => Promise<void>
  /** The generation result, or null if not yet generated */
  result: TOutput | null
  /** Whether a generation is currently in progress */
  isLoading: boolean
  /** Current error, if any */
  error: Error | undefined
  /** Current state of the generation client */
  status: GenerationClientState
  /** Abort the current generation */
  stop: () => void
  /** Clear result, error, and return to idle */
  reset: () => void
  /** Lightweight generation state snapshot, if one is available */
  resumeSnapshot: GenerationResumeSnapshot | undefined
  /** Observed run/cursor metadata from the snapshot (read-only state) */
  resumeState: GenerationResumeState | null
  /** Pending persisted artifact references observed during generation/replay */
  pendingArtifacts: Array<GenerationPendingArtifact>
  /** Final persisted artifact references observed from a replayed result */
  resultArtifacts: Array<PersistedArtifactRef>
}

/**
 * Generic React hook for one-shot generation tasks.
 *
 * This is the base hook used by `useGenerateImage`, `useGenerateSpeech`,
 * `useTranscription`, and `useSummarize`. You can also use it directly
 * for custom generation types.
 *
 * @template TInput - The input type for the generation request
 * @template TResult - The result type returned by the generation
 *
 * @example
 * ```tsx
 * const { generate, result, isLoading } = useGeneration<MyInput, MyResult>({
 *   connection: fetchServerSentEvents('/api/generate/custom'),
 * })
 *
 * await generate({ prompt: 'Hello' })
 * ```
 */
// `TTransformed` infers from the `onResult` return position (a covariant
// inference site that works even for an optional nested property), which types
// the callback parameter as `TResult` and narrows `result`. Inferring the
// whole callback as a defaulted type parameter instead collapses to the
// default, leaving the parameter `any` — a hard error under `strict`. See
// issue #848.
export function useGeneration<
  TInput extends Record<string, any>,
  TResult,
  TTransformed = void,
>(
  options: Omit<UseGenerationOptions<TInput, TResult>, 'onResult'> & {
    onResult?: (result: TResult) => TTransformed
  },
): UseGenerationReturn<InferGenerationOutputFromReturn<TResult, TTransformed>> {
  type TOutput = InferGenerationOutputFromReturn<TResult, TTransformed>
  const hookId = useId()
  const clientId = options.id || hookId

  const [result, setResult] = useState<TOutput | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | undefined>(undefined)
  const [status, setStatus] = useState<GenerationClientState>('idle')
  const [resumeSnapshot, setResumeSnapshot] = useState<
    GenerationResumeSnapshot | undefined
  >(options.initialResumeSnapshot)

  const optionsRef = useRef(options)
  optionsRef.current = options

  const client = useMemo(() => {
    const opts = optionsRef.current

    // Conditional spread for `body` (strict-optional in target;
    // local source is `Record<string, any> | undefined`). Callbacks
    // wrap optional ones in non-returning bodies so `?.()`'s
    // implicit `undefined` doesn't pollute the function return type.
    const clientOptions: GenerationClientOptions<TInput, TResult, TOutput> = {
      id: clientId,
      body: opts.body,
      ...(opts.persistence !== undefined && { persistence: opts.persistence }),
      ...(opts.initialResumeSnapshot !== undefined && {
        initialResumeSnapshot: opts.initialResumeSnapshot,
      }),
      devtoolsBridgeFactory: createGenerationDevtoolsBridge,
      devtools: {
        hookName: 'useGeneration',
        framework: 'react',
        ...opts.devtools,
      },
      // The transform's raw return type (`TTransformed`) and the stored output
      // (`TOutput`, with null/void/undefined stripped) are identical at runtime;
      // the cast bridges the relationship that the conditional type hides.
      onResult: ((r: TResult) => optionsRef.current.onResult?.(r)) as (
        result: TResult,
      ) => TOutput | null | void,
      onError: (e: Error) => {
        optionsRef.current.onError?.(e)
      },
      onProgress: (p: number, m?: string) => {
        optionsRef.current.onProgress?.(p, m)
      },
      onChunk: (c: StreamChunk) => {
        optionsRef.current.onChunk?.(c)
      },
      onResultChange: setResult,
      onLoadingChange: setIsLoading,
      onErrorChange: setError,
      onStatusChange: setStatus,
      onResumeSnapshotChange: setResumeSnapshot,
    }

    if (opts.connection) {
      return new GenerationClient<TInput, TResult, TOutput>({
        ...clientOptions,
        connection: opts.connection,
      })
    }

    if (opts.fetcher) {
      return new GenerationClient<TInput, TResult, TOutput>({
        ...clientOptions,
        fetcher: opts.fetcher,
      })
    }

    throw new Error(
      'useGeneration requires either a connection or fetcher option',
    )
  }, [clientId])

  // Sync body changes without recreating client
  useEffect(() => {
    // Conditional spread: target uses strict-optional `body?: T`.
    client.updateOptions({
      ...(options.body !== undefined && { body: options.body }),
    })
  }, [client, options.body])

  // Mount devtools and clean up on unmount. Generation runs are never
  // auto-started on mount — persisted state is read-only for display.
  useEffect(() => {
    client.mountDevtools()

    return () => {
      client.dispose()
    }
  }, [client])

  const generate = useCallback(
    async (input: TInput) => {
      await client.generate(input)
    },
    [client],
  )

  const stop = useCallback(() => {
    client.stop()
  }, [client])

  const reset = useCallback(() => {
    client.reset()
  }, [client])

  return {
    generate: generate as (input: Record<string, any>) => Promise<void>,
    result,
    isLoading,
    error,
    status,
    stop,
    reset,
    resumeSnapshot,
    resumeState: resumeSnapshot?.resumeState ?? null,
    pendingArtifacts: resumeSnapshot?.pendingArtifacts ?? [],
    resultArtifacts: resumeSnapshot?.result?.artifacts ?? [],
  }
}
