import { GenerationClient } from '@tanstack/ai-client'
import { createGenerationDevtoolsBridge } from '@tanstack/ai-client/devtools'
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

/**
 * Options for the createGeneration function.
 *
 * Accepts either a `connection` (streaming transport) or a `fetcher` (direct async call).
 *
 * @template TInput - The input type for the generation request
 * @template TResult - The result type returned by the generation
 * @template TOutput - The output type after optional transform (defaults to TResult)
 */
export interface CreateGenerationOptions<TInput, TResult, TOutput = TResult> {
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
   * specialized function (image / speech / audio / transcription / summarize).
   * Forwarded to the client so a server-hydrate restore repaints `result`.
   */
  reconstructResult?: (restored: GenerationRestoredResult) => TResult | null
}

/**
 * Return type for the createGeneration function.
 *
 * @template TOutput - The output type (after optional transform)
 * @template TInput - The input type accepted by `generate` (defaults to any object)
 */
export interface CreateGenerationReturn<
  TOutput,
  TInput extends Record<string, any> = Record<string, any>,
> {
  /** The generation result, or null if not yet generated */
  readonly result: TOutput | null
  /** Whether a generation is currently in progress */
  readonly isLoading: boolean
  /** Current error, if any */
  readonly error: Error | undefined
  /** Current state of the generation client */
  readonly status: GenerationClientState
  /** Trigger a generation request */
  generate: (input: TInput) => Promise<void>
  /** Abort the current generation */
  stop: () => void
  /** Clear result, error, and return to idle */
  reset: () => void
  /** Stop in-flight work and unregister devtools listeners */
  dispose: () => void
  /** Update additional body parameters */
  updateBody: (body: Record<string, any>) => void
  /**
   * The id of the generation job currently running, or `null` when nothing is in
   * flight. Each call to `generate` is one job with its own id. Pass it to your
   * own endpoint to cancel or poll the provider job — `stop()` only aborts the
   * local stream, it does not stop work already running on the provider.
   */
  readonly runId: string | null
}

/**
 * Creates a reactive generation instance for Svelte 5.
 *
 * This is the base function used by `createGenerateImage`, `createGenerateSpeech`,
 * `createTranscription`, and `createSummarize`. You can also use it directly
 * for custom generation types.
 *
 * @template TInput - The input type for the generation request
 * @template TResult - The result type returned by the generation
 *
 * @example
 * ```svelte
 * <script>
 *   import { createGeneration, fetchServerSentEvents } from '@tanstack/ai-svelte'
 *
 *   const gen = createGeneration({
 *     connection: fetchServerSentEvents('/api/generate/custom'),
 *   })
 * </script>
 *
 * <div>
 *   <button onclick={() => gen.generate({ prompt: 'Hello' })}>Generate</button>
 *   {#if gen.isLoading}
 *     <p>Generating...</p>
 *   {/if}
 *   {#if gen.result}
 *     <p>{JSON.stringify(gen.result)}</p>
 *   {/if}
 * </div>
 * ```
 */
export function createGeneration<
  TInput extends Record<string, any>,
  TResult,
  TTransformed = void,
>(
  options: Omit<
    CreateGenerationOptions<TInput, TResult>,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: TResult) => TTransformed
  } & GenerationPersistenceOptions,
): CreateGenerationReturn<
  InferGenerationOutputFromReturn<TResult, TTransformed>,
  TInput
> {
  type TOutput = InferGenerationOutputFromReturn<TResult, TTransformed>
  // Create reactive state using Svelte 5 runes
  /** The generation result, or null if not yet generated */
  let result = $state<TOutput | null>(null)
  /** Whether a generation is currently in progress */
  let isLoading = $state(false)
  /** Current error, if any */
  let error = $state<Error | undefined>(undefined)
  /** Current state of the generation client */
  let status = $state<GenerationClientState>('idle')
  let runId = $state<string | null>(null)
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
      framework: 'svelte',
      hookName: 'createGeneration',
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
      result = r
    },
    onLoadingChange: (l: boolean) => {
      if (disposed) return
      isLoading = l
    },
    onErrorChange: (e: Error | undefined) => {
      if (disposed) return
      error = e
    },
    onStatusChange: (s: GenerationClientState) => {
      if (disposed) return
      status = s
    },
    onResumeStateChange: (rs) => {
      if (disposed) return
      runId = rs?.runId ?? null
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
      'createGeneration requires either a connection or fetcher option',
    )
  }

  // Mount devtools only. Generation runs are never auto-started on setup —
  // persisted state is read-only for display.
  client.mountDevtools()

  /** Trigger a generation request */
  const generate = async (input: TInput) => {
    disposed = false
    client.mountDevtools()
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

  /** Stop in-flight work and unregister devtools listeners */
  const dispose = () => {
    disposed = true
    client.dispose()
  }

  /** Update additional body parameters */
  const updateBody = (newBody: Record<string, any>) => {
    client.updateOptions({ body: newBody })
  }

  return {
    get result() {
      return result
    },
    get isLoading() {
      return isLoading
    },
    get error() {
      return error
    },
    get status() {
      return status
    },
    generate,
    stop,
    reset,
    dispose,
    updateBody,
    get runId() {
      return runId
    },
  }
}
