import { GenerationClient } from '@tanstack/ai-client'
import { createGenerationDevtoolsBridge } from '@tanstack/ai-client/devtools'
import type { StreamChunk } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ConnectConnectionAdapter,
  GenerationClientOptions,
  GenerationClientState,
  GenerationFetcher,
  GenerationPersistence,
  GenerationPersistenceOptions,
  GenerationRestoredResult,
  GenerationResumeSnapshot,
  GenerationResumeState,
  InferGenerationOutputFromReturn,
} from '@tanstack/ai-client'

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
  persistence?: boolean | GenerationPersistence
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
   * specialized function (image / audio / transcription / summarize). Forwarded
   * to the client so a client-store / server-hydrate restore repaints `result`.
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
  /** Identity of the in-flight run while one is streaming, or null after it ends */
  readonly resumeState: GenerationResumeState | null
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
// `TTransformed` infers from the `onResult` return position (a covariant
// inference site that works even for an optional nested property), which types
// the callback parameter as `TResult` and narrows `result`. Inferring the
// whole callback as a defaulted type parameter instead collapses to the
// default, leaving the parameter `any` — a hard error under `strict`. See
// issue #848.
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
  const clientId =
    options.id || `gen-${Date.now()}-${Math.random().toString(36).substring(7)}`

  // Create reactive state using Svelte 5 runes
  let result = $state<TOutput | null>(null)
  let isLoading = $state(false)
  let error = $state<Error | undefined>(undefined)
  let status = $state<GenerationClientState>('idle')
  let resumeState = $state<GenerationResumeState | null>(
    options.initialResumeSnapshot?.resumeState ?? null,
  )
  let disposed = false

  // `body` uses a conditional spread because `GenerationClientOptions.body`
  // is declared `body?: Record<string, any>` (absent vs. present) under
  // `exactOptionalPropertyTypes`. Assigning `undefined` directly would be
  // rejected — the optional caller `options.body` may be undefined, in which
  // case we want the key to be absent.
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
      framework: 'svelte',
      hookName: 'createGeneration',
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
    onResumeStateChange: (rs: GenerationResumeState | null) => {
      if (disposed) return
      resumeState = rs
    },
  }

  let client: GenerationClient<TInput, TResult, TOutput>

  if (options.connection) {
    client = new GenerationClient<TInput, TResult, TOutput>({
      ...clientOptions,
      connection: options.connection,
    })
  } else if (options.fetcher) {
    client = new GenerationClient<TInput, TResult, TOutput>({
      ...clientOptions,
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

  // Note: Cleanup is handled by calling dispose() directly when needed.
  // Unlike React/Vue/Solid, Svelte 5 runes like $effect can only be used
  // during component initialization, so we don't add automatic cleanup here.
  // Users should call gen.dispose() in their component's cleanup if needed.

  const generate = async (input: TInput) => {
    // Svelte has no remount effect to revive a disposed client (the other
    // frameworks revive via mountDevtools() in their mount effects), so an
    // explicit generate() after dispose() is the Svelte revive path: bring
    // the client and the reactive bindings back together.
    disposed = false
    client.mountDevtools()
    await client.generate(input)
  }

  const stop = () => {
    client.stop()
  }

  const reset = () => {
    client.reset()
  }

  const dispose = () => {
    disposed = true
    client.dispose()
  }

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
    get resumeState() {
      return resumeState
    },
  }
}
