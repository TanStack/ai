import { GenerationClient } from '@tanstack/ai-client'
import { createGenerationDevtoolsBridge } from '@tanstack/ai-client/devtools'
import {
  createEffect,
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
  untrack,
} from 'solid-js'
import type { StreamChunk } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ConnectConnectionAdapter,
  GenerationClientOptions,
  GenerationClientState,
  GenerationFetcher,
  GenerationPersistenceOptions,
  GenerationRestoredResult,
  GenerationResumeSnapshot,
  InferGenerationOutputFromReturn,
} from '@tanstack/ai-client'
import type { Accessor } from 'solid-js'

/**
 * Options for the useGeneration hook.
 *
 * Accepts either a `connection` (streaming transport) or a `fetcher` (direct async call).
 *
 * @template TInput - The input type for the generation request
 * @template TResult - The result type returned by the generation
 * @template TOutput - The transformed output type (defaults to TResult)
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
  /**
   * How this generation persists across reloads.
   * - Omit / `false`: ephemeral, in-memory only.
   * - `true`: server-driven — on mount the client hydrates the last generation
   *   for its `threadId` from the server (needs a connection with a
   *   `hydrateGeneration` handler) and repaints it; it never auto-starts a run.
   * - a storage adapter: client-driven — the lightweight snapshot is cached under
   *   `generation:<threadId>` as a run streams and read back on mount. Media bytes are
   *   never stored.
   */
  persistence?: boolean
  /**
   * The **scope** this generation belongs to: a stable, app-chosen name for the
   * slot successive runs fill — not a link to a chat conversation.
   *
   * The hook starts empty and produces many runs over its life; each gets its
   * own `runId`, but all belong to one scope. Persistence keys on this in both
   * modes, so derive it from your own domain and keep it identical across
   * reloads (e.g. `` `video-${videoId}-start-frame` ``). It is also sent as the
   * AG-UI thread id on the wire, which the protocol requires.
   *
   * **Required whenever `persistence` is set** — an app that cannot name the
   * scope has nothing to restore to. Optional for ephemeral generations, where
   * it falls back to `id` purely to satisfy the wire.
   */
  threadId?: string
  /** Explicit resume-snapshot seed for apps that manage storage themselves; skips automatic hydration from `persistence`. Later run events merge into it. */
  initialResumeSnapshot?: GenerationResumeSnapshot
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
   * specialized hook (image / audio / transcription / summarize). Forwarded to
   * the client so a client-store / server-hydrate restore repaints `result`.
   */
  reconstructResult?: (restored: GenerationRestoredResult) => TResult | null
}

/**
 * Return type for the useGeneration hook.
 *
 * @template TOutput - The output type (possibly transformed from the raw result)
 * @template TInput - The input type accepted by `generate` (defaults to any object)
 */
export interface UseGenerationReturn<
  TOutput,
  TInput extends Record<string, any> = Record<string, any>,
> {
  /** Trigger a generation request */
  generate: (input: TInput) => Promise<void>
  /** The generation result, or null if not yet generated */
  result: Accessor<TOutput | null>
  /** Whether a generation is currently in progress */
  isLoading: Accessor<boolean>
  /** Current error, if any */
  error: Accessor<Error | undefined>
  /** Current state of the generation client */
  status: Accessor<GenerationClientState>
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
  runId: Accessor<string | null>
}

/**
 * Generic Solid hook for one-shot generation tasks.
 *
 * This is the base hook used by `useGenerateImage`, `useGenerateSpeech`,
 * `useTranscription`, and `useSummarize`. You can also use it directly
 * for custom generation types.
 *
 * @template TInput - The input type for the generation request
 * @template TResult - The result type returned by the generation
 * @template TOutput - The transformed output type (defaults to TResult)
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
  const hookId = createUniqueId()
  const clientId = options.id || hookId

  const [result, setResult] = createSignal<TOutput | null>(null)
  const [isLoading, setIsLoading] = createSignal(false)
  const [error, setError] = createSignal<Error | undefined>(undefined)
  const [status, setStatus] = createSignal<GenerationClientState>('idle')
  const [runId, setRunId] = createSignal<string | null>(
    options.initialResumeSnapshot?.resumeState?.runId ?? null,
  )
  let disposed = false

  // Built once. `untrack` keeps the option reads below from subscribing
  // construction to `options.persistence` / `options.initialResumeSnapshot` /
  // `options.devtools` / `options.body`: a re-run would build a second client
  // and orphan the first (only the live one is disposed on cleanup). Later
  // `options.body` changes are pushed through `updateOptions` instead.
  const client = untrack((): GenerationClient<TInput, TResult, TOutput> => {
    // Conditional spread on `body`: `GenerationClientOptions.body` is a
    // strict optional (`body?: Record<string, any>`) and EOPT forbids
    // assigning the source `T | undefined` directly.
    const clientOptions: GenerationClientOptions<TInput, TResult, TOutput> = {
      id: clientId,
      body: options.body,
      ...(options.persistence !== undefined && {
        persistence: options.persistence,
      }),
      ...(options.threadId !== undefined && { threadId: options.threadId }),
      ...(options.initialResumeSnapshot !== undefined && {
        initialResumeSnapshot: options.initialResumeSnapshot,
      }),
      ...(options.hydrateGeneration !== undefined && {
        hydrateGeneration: options.hydrateGeneration,
      }),
      ...(options.joinRun !== undefined && { joinRun: options.joinRun }),
      ...(options.reconstructResult
        ? { reconstructResult: options.reconstructResult }
        : {}),
      devtoolsBridgeFactory: createGenerationDevtoolsBridge,
      devtools: {
        ...options.devtools,
        framework: 'solid',
        hookName: 'useGeneration',
      },
      // The transform's raw return type (`TTransformed`) and the stored output
      // (`TOutput`, with null/void/undefined stripped) are identical at runtime;
      // the cast bridges the relationship that the conditional type hides.
      onResult: ((r: TResult) => options.onResult?.(r)) as (
        result: TResult,
      ) => TOutput | null | void,
      onError: (e: Error) => {
        if (!disposed) options.onError?.(e)
      },
      onProgress: (p: number, m?: string) => {
        if (!disposed) options.onProgress?.(p, m)
      },
      onChunk: (c: StreamChunk) => {
        if (!disposed) options.onChunk?.(c)
      },
      onResultChange: (r) => {
        if (!disposed) setResult(() => r)
      },
      onLoadingChange: (l) => {
        if (!disposed) setIsLoading(l)
      },
      onErrorChange: (e) => {
        if (!disposed) setError(e)
      },
      onStatusChange: (s) => {
        if (!disposed) setStatus(s)
      },
      onResumeStateChange: (rs) => {
        if (!disposed) setRunId(rs?.runId ?? null)
      },
    }

    if (options.connection) {
      return new GenerationClient<TInput, TResult, TOutput>({
        ...clientOptions,
        connection: options.connection,
      })
    }

    if (options.fetcher) {
      return new GenerationClient<TInput, TResult, TOutput>({
        ...clientOptions,
        fetcher: options.fetcher,
      })
    }

    throw new Error(
      'useGeneration requires either a connection or fetcher option',
    )
  })

  // Sync body changes without recreating client
  createEffect(() => {
    const currentBody = options.body
    client.updateOptions({
      ...(currentBody !== undefined && { body: currentBody }),
    })
  })

  // Mount devtools only. Generation runs are never auto-started on mount — a
  // persisted snapshot is hydrated for display, never replayed.
  onMount(() => {
    client.mountDevtools()
  })

  // Cleanup on unmount: stop any in-flight requests and unregister devtools
  onCleanup(() => {
    disposed = true
    client.dispose()
  })

  const generate = async (input: TInput) => {
    await client.generate(input)
  }

  const stop = () => {
    client.stop()
  }

  const reset = () => {
    client.reset()
  }

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
