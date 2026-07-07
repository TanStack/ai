import { GenerationClient } from '@tanstack/ai-client'
import { createGenerationDevtoolsBridge } from '@tanstack/ai-client/devtools'
import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
} from 'solid-js'
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
  /** Server-side lightweight resume state persistence. */
  persistence?: GenerationPersistenceOptions
  /** Whether to resume a persisted run on mount. Defaults to true. */
  autoResume?: boolean
  /** Initial lightweight resume snapshot restored by the app. */
  initialResumeSnapshot?: GenerationResumeSnapshot
  /** Explicit run/cursor state to use for the next resume/generation request. */
  resumeState?: GenerationResumeState
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
 * @template TOutput - The output type (possibly transformed from the raw result)
 */
export interface UseGenerationReturn<TOutput> {
  /** Trigger a generation request */
  generate: (input: Record<string, any>) => Promise<void>
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
  /** Lightweight generation resume snapshot, if one is available */
  resumeSnapshot: Accessor<GenerationResumeSnapshot | undefined>
  /** Current resumable run/cursor state, if one is available */
  resumeState: Accessor<GenerationResumeState | null>
  /** Pending persisted artifact references observed during generation/replay */
  pendingArtifacts: Accessor<Array<GenerationPendingArtifact>>
  /** Final persisted artifact references observed from a replayed result */
  resultArtifacts: Accessor<Array<PersistedArtifactRef>>
  /** Resume the current/initial generation run, if resumable */
  resume: (state?: GenerationResumeState) => Promise<boolean>
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
  options: Omit<UseGenerationOptions<TInput, TResult>, 'onResult'> & {
    onResult?: (result: TResult) => TTransformed
  },
): UseGenerationReturn<InferGenerationOutputFromReturn<TResult, TTransformed>> {
  type TOutput = InferGenerationOutputFromReturn<TResult, TTransformed>
  const hookId = createUniqueId()
  const clientId = options.id || hookId

  const [result, setResult] = createSignal<TOutput | null>(null)
  const [isLoading, setIsLoading] = createSignal(false)
  const [error, setError] = createSignal<Error | undefined>(undefined)
  const [status, setStatus] = createSignal<GenerationClientState>('idle')
  const [resumeSnapshot, setResumeSnapshot] = createSignal<
    GenerationResumeSnapshot | undefined
  >(options.initialResumeSnapshot)
  let disposed = false

  const client = createMemo(() => {
    // Conditional spread on `body`: `GenerationClientOptions.body` is a
    // strict optional (`body?: Record<string, any>`) and EOPT forbids
    // assigning the source `T | undefined` directly.
    const clientOptions: GenerationClientOptions<TInput, TResult, TOutput> = {
      id: clientId,
      body: options.body,
      ...(options.persistence !== undefined && {
        persistence: options.persistence,
      }),
      ...(options.autoResume !== undefined && {
        autoResume: options.autoResume,
      }),
      ...(options.initialResumeSnapshot !== undefined && {
        initialResumeSnapshot: options.initialResumeSnapshot,
      }),
      ...(options.resumeState !== undefined && {
        resumeState: options.resumeState,
      }),
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
      onResumeSnapshotChange: (snapshot) => {
        if (!disposed) setResumeSnapshot(snapshot)
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
  }, [clientId])

  // Sync body changes without recreating client
  createEffect(() => {
    const currentBody = options.body
    const currentResumeState = options.resumeState
    client().updateOptions({
      ...(currentBody !== undefined && { body: currentBody }),
      ...(currentResumeState !== undefined && {
        resumeState: currentResumeState,
      }),
    })
  })

  onMount(() => {
    client().mountDevtools()
    void client()
      .maybeAutoResume()
      .catch((err: unknown) => {
        if (disposed) return
        const nextError = err instanceof Error ? err : new Error(String(err))
        options.onError?.(nextError)
        setError(nextError)
        setStatus('error')
      })
      .finally(() => {
        if (disposed) return
        setResumeSnapshot(client().getResumeSnapshot())
      })
  })

  // Cleanup on unmount: stop any in-flight requests and unregister devtools
  onCleanup(() => {
    disposed = true
    client().dispose()
  })

  const generate = async (input: TInput) => {
    await client().generate(input)
  }

  const stop = () => {
    client().stop()
  }

  const reset = () => {
    client().reset()
  }

  const resume = async (state?: GenerationResumeState) => {
    const didResume = await client().resume(state)
    if (!disposed) {
      setResumeSnapshot(client().getResumeSnapshot())
    }
    return didResume
  }

  return {
    generate: generate as (input: Record<string, any>) => Promise<void>,
    result,
    isLoading,
    error,
    status,
    stop,
    reset,
    resumeSnapshot,
    resumeState: () => resumeSnapshot()?.resumeState ?? null,
    pendingArtifacts: () => resumeSnapshot()?.pendingArtifacts ?? [],
    resultArtifacts: () => resumeSnapshot()?.result?.artifacts ?? [],
    resume,
  }
}
