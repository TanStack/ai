import { GenerationClient } from '@tanstack/ai-client'
import { createGenerationDevtoolsBridge } from '@tanstack/ai-client/devtools'
import { onMounted, onScopeDispose, readonly, shallowRef, watch } from 'vue'
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
import type { ByokClient } from '@tanstack/ai-client/byok'
import type { ProviderId } from '@tanstack/ai/byok'
import type { DeepReadonly, ShallowRef } from 'vue'

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
     * specialized composable (image / speech / audio / transcription / summarize).
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
  result: DeepReadonly<ShallowRef<TOutput | null>>
  /** Whether a generation is currently in progress */
  isLoading: DeepReadonly<ShallowRef<boolean>>
  /** Current error, if any */
  error: DeepReadonly<ShallowRef<Error | undefined>>
  /** Current state of the generation client */
  status: DeepReadonly<ShallowRef<GenerationClientState>>
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
  runId: DeepReadonly<ShallowRef<string | null>>
}

/**
 * Generic Vue composable for one-shot generation tasks.
 *
 * This is the base composable used by `useGenerateImage`, `useGenerateSpeech`,
 * `useTranscription`, and `useSummarize`. You can also use it directly
 * for custom generation types.
 *
 * @template TInput - The input type for the generation request
 * @template TResult - The result type returned by the generation
 *
 * @example
 * ```vue
 * <script setup>
 * import { useGeneration } from '@tanstack/ai-vue'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 *
 * const { generate, result, isLoading } = useGeneration({
 *   connection: fetchServerSentEvents('/api/generate/custom'),
 * })
 * </script>
 * ```
 */
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

  /** The generation result, or null if not yet generated */
  const result = shallowRef<TOutput | null>(null)
  /** Whether a generation is currently in progress */
  const isLoading = shallowRef(false)
  /** Current error, if any */
  const error = shallowRef<Error | undefined>(undefined)
  /** Current state of the generation client */
  const status = shallowRef<GenerationClientState>('idle')
  const runId = shallowRef<string | null>(null)
  let disposed = false

  const clientOptions: Omit<
    GenerationClientOptions<TInput, TResult, TOutput>,
    'persistence' | 'threadId'
  > = {
    body: options.body,
    ...(options.hydrateGeneration !== undefined && {
      hydrateGeneration: options.hydrateGeneration,
    }),
    ...(options.joinRun !== undefined && { joinRun: options.joinRun }),
    ...(options.byok !== undefined && { byok: options.byok }),
    byokProvider: () => options.byokProvider?.(),
    ...(options.reconstructResult
      ? { reconstructResult: options.reconstructResult }
      : {}),
    devtoolsBridgeFactory: createGenerationDevtoolsBridge,
    devtools: {
      ...options.devtools,
      framework: 'vue',
      hookName: 'useGeneration',
    },
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
    onResultChange: (r: TOutput | null) => {
      if (disposed) return
      result.value = r
    },
    onLoadingChange: (l: boolean) => {
      if (disposed) return
      isLoading.value = l
    },
    onErrorChange: (e: Error | undefined) => {
      if (disposed) return
      error.value = e
    },
    onStatusChange: (s: GenerationClientState) => {
      if (disposed) return
      status.value = s
    },
    onResumeStateChange: (rs) => {
      if (disposed) return
      runId.value = rs?.runId ?? null
    },
  }

  const persistenceProps =
    typeof options.threadId === 'string' && options.persistence
      ? {
          persistence: options.persistence,
          threadId: options.threadId,
        }
      : {
          ...(options.threadId !== undefined && {
            threadId: options.threadId,
          }),
        }

  let client: GenerationClient<TInput, TResult, TOutput>

  if (options.connection) {
    client = new GenerationClient<TInput, TResult, TOutput>({
      ...clientOptions,
      ...persistenceProps,
      connection: options.connection,
    })
  } else if (options.fetcher) {
    client = new GenerationClient<TInput, TResult, TOutput>({
      ...clientOptions,
      ...persistenceProps,
      fetcher: options.fetcher,
    })
  } else {
    throw new Error(
      'useGeneration requires either a connection or fetcher option',
    )
  }

  watch(
    () => options.body,
    (newBody) => {
      client.updateOptions({
        ...(newBody !== undefined && { body: newBody }),
      })
    },
  )

  // Mount devtools only. Generation runs are never auto-started on mount —
  // persisted state is read-only for display.
  onMounted(() => {
    client.mountDevtools()
  })

  // Cleanup on scope dispose: stop any in-flight requests and unregister devtools
  onScopeDispose(() => {
    disposed = true
    client.dispose()
  })

  /** Trigger a generation request */
  const generate = async (input: TInput) => {
    await client.generate(input)
  }

  /** Abort the current generation */
  const stop = () => {
    client.stop()
  }

  /** Clear result, error, and return to idle */
  const reset = () => {
    client.reset()
  }

  return {
    generate,
    result: readonly(result) as UseGenerationReturn<TOutput>['result'],
    isLoading: readonly(isLoading),
    error: readonly(error),
    status: readonly(status),
    stop,
    reset,
    runId: readonly(runId),
  }
}
