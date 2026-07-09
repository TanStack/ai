import { GenerationClient } from '@tanstack/ai-client'
import { createGenerationDevtoolsBridge } from '@tanstack/ai-client/devtools'
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
 * Return type for the createGeneration function.
 *
 * @template TOutput - The output type (after optional transform)
 */
export interface CreateGenerationReturn<TOutput> {
  /** The generation result, or null if not yet generated */
  readonly result: TOutput | null
  /** Whether a generation is currently in progress */
  readonly isLoading: boolean
  /** Current error, if any */
  readonly error: Error | undefined
  /** Current state of the generation client */
  readonly status: GenerationClientState
  /** Trigger a generation request */
  generate: (input: Record<string, any>) => Promise<void>
  /** Abort the current generation */
  stop: () => void
  /** Clear result, error, and return to idle */
  reset: () => void
  /** Stop in-flight work and unregister devtools listeners */
  dispose: () => void
  /** Update additional body parameters */
  updateBody: (body: Record<string, any>) => void
  /** Lightweight generation resume snapshot, if one is available */
  readonly resumeSnapshot: GenerationResumeSnapshot | undefined
  /** Observed run/cursor metadata from the snapshot (read-only state) */
  readonly resumeState: GenerationResumeState | null
  /** Pending persisted artifact references observed during generation/replay */
  readonly pendingArtifacts: Array<GenerationPendingArtifact>
  /** Final persisted artifact references observed from a replayed result */
  readonly resultArtifacts: Array<PersistedArtifactRef>
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
  options: Omit<CreateGenerationOptions<TInput, TResult>, 'onResult'> & {
    onResult?: (result: TResult) => TTransformed
  },
): CreateGenerationReturn<
  InferGenerationOutputFromReturn<TResult, TTransformed>
> {
  type TOutput = InferGenerationOutputFromReturn<TResult, TTransformed>
  const clientId =
    options.id || `gen-${Date.now()}-${Math.random().toString(36).substring(7)}`

  // Create reactive state using Svelte 5 runes
  let result = $state<TOutput | null>(null)
  let isLoading = $state(false)
  let error = $state<Error | undefined>(undefined)
  let status = $state<GenerationClientState>('idle')
  let resumeSnapshot = $state<GenerationResumeSnapshot | undefined>(
    options.initialResumeSnapshot,
  )
  let disposed = false

  const setResumeSnapshotState = (
    snapshot: GenerationResumeSnapshot | undefined,
  ) => {
    if (disposed) return
    resumeSnapshot = snapshot
  }

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
    ...(options.initialResumeSnapshot !== undefined && {
      initialResumeSnapshot: options.initialResumeSnapshot,
    }),
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
    onResumeSnapshotChange: setResumeSnapshotState,
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
    generate: generate as (input: Record<string, any>) => Promise<void>,
    stop,
    reset,
    dispose,
    updateBody,
    get resumeSnapshot() {
      return resumeSnapshot
    },
    get resumeState() {
      return resumeSnapshot?.resumeState ?? null
    },
    get pendingArtifacts() {
      return resumeSnapshot?.pendingArtifacts ?? []
    },
    get resultArtifacts() {
      return resumeSnapshot?.result?.artifacts ?? []
    },
  }
}
