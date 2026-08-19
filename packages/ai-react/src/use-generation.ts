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
  GenerationPersistenceOptions,
  GenerationRestoredResult,
  InferGenerationOutputFromReturn,
} from '@tanstack/ai-client'

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
  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>
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
  /**
   * @internal Rebuild a typed result from a restored snapshot, injected by each
   * specialized hook (image / speech / audio / transcription / summarize).
   * Forwarded to the client so a server-hydrate restore repaints `result`.
   */
  reconstructResult?: (restored: GenerationRestoredResult) => TResult | null
}

/**
 * Return type for the useGeneration hook.
 *
 * @template TOutput - The output type (after optional transform)
 * @template TInput - The input type accepted by `generate` (defaults to any object)
 */
export interface UseGenerationReturn<
  TOutput,
  TInput extends Record<string, any> = Record<string, any>,
> {
  /** Trigger a generation request */
  generate: (input: TInput) => Promise<void>
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
  /**
   * The id of the generation job currently running, or `null` when nothing is in
   * flight. Each call to `generate` is one job with its own id. Pass it to your
   * own endpoint to cancel or poll the provider job — `stop()` only aborts the
   * local stream, it does not stop work already running on the provider.
   */
  runId: string | null
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
  options: Omit<
    UseGenerationOptions<TInput, TResult>,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: TResult) => TTransformed
  } & GenerationPersistenceOptions,
): UseGenerationReturn<
  InferGenerationOutputFromReturn<TResult, TTransformed>,
  TInput
> {
  type TOutput = InferGenerationOutputFromReturn<TResult, TTransformed>
  const hookId = useId()
  // The hook identity is `threadId`. `hookId` is only a React recreation key.
  const clientIdentity = options.threadId ?? hookId

  const [result, setResult] = useState<TOutput | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | undefined>(undefined)
  const [status, setStatus] = useState<GenerationClientState>('idle')
  const [runId, setRunId] = useState<string | null>(null)

  const optionsRef = useRef(options)
  optionsRef.current = options
  const disposedRef = useRef(false)

  const client = useMemo(() => {
    const opts = optionsRef.current

    // Conditional spread for `body` (strict-optional in target;
    // local source is `Record<string, any> | undefined`). Callbacks
    // wrap optional ones in non-returning bodies so `?.()`'s
    // implicit `undefined` doesn't pollute the function return type.
    const clientOptions: Omit<
      GenerationClientOptions<TInput, TResult, TOutput>,
      'persistence' | 'threadId'
    > = {
      body: opts.body,
      ...(opts.hydrateGeneration !== undefined && {
        hydrateGeneration: opts.hydrateGeneration,
      }),
      ...(opts.joinRun !== undefined && { joinRun: opts.joinRun }),
      ...(opts.reconstructResult
        ? { reconstructResult: opts.reconstructResult }
        : {}),
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
        if (!disposedRef.current) optionsRef.current.onError?.(e)
      },
      onProgress: (p: number, m?: string) => {
        if (!disposedRef.current) optionsRef.current.onProgress?.(p, m)
      },
      onChunk: (c: StreamChunk) => {
        if (!disposedRef.current) optionsRef.current.onChunk?.(c)
      },
      onResultChange: (r) => {
        if (!disposedRef.current) setResult(r)
      },
      onLoadingChange: (l) => {
        if (!disposedRef.current) setIsLoading(l)
      },
      onErrorChange: (e) => {
        if (!disposedRef.current) setError(e)
      },
      onStatusChange: (s) => {
        if (!disposedRef.current) setStatus(s)
      },
      onResumeStateChange: (rs) => {
        if (!disposedRef.current) setRunId(rs?.runId ?? null)
      },
    }

    const persistenceProps =
      typeof opts.threadId === 'string' && opts.persistence
        ? {
            persistence: opts.persistence,
            threadId: opts.threadId,
          }
        : {
            ...(opts.threadId !== undefined && { threadId: opts.threadId }),
          }

    if (opts.connection) {
      return new GenerationClient<TInput, TResult, TOutput>({
        ...clientOptions,
        ...persistenceProps,
        connection: opts.connection,
      })
    }

    if (opts.fetcher) {
      return new GenerationClient<TInput, TResult, TOutput>({
        ...clientOptions,
        ...persistenceProps,
        fetcher: opts.fetcher,
      })
    }

    throw new Error(
      'useGeneration requires either a connection or fetcher option',
    )
  }, [clientIdentity, hookId])

  // Sync body changes without recreating client
  useEffect(() => {
    // Conditional spread: target uses strict-optional `body?: T`.
    client.updateOptions({
      ...(options.body !== undefined && { body: options.body }),
    })
  }, [client, options.body])

  // Mount devtools and clean up on unmount. Generation runs are never
  // auto-started on mount — persisted state is only displayed. Mounting
  // revives the client after a StrictMode dispose → remount replay.
  useEffect(() => {
    disposedRef.current = false
    client.mountDevtools()

    return () => {
      disposedRef.current = true
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
    generate,
    result,
    isLoading,
    error,
    status,
    stop,
    reset,
    runId,
  }
}
