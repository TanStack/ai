import { GenerationClient } from '@tanstack/ai-client'
import { createGenerationDevtoolsBridge } from '@tanstack/ai-client/devtools'
import {
  DestroyRef,
  Injector,
  afterNextRender,
  assertInInjectionContext,
  effect,
  inject,
  signal,
} from '@angular/core'
import { toReactive } from './internal/to-reactive'
import type { Signal } from '@angular/core'
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
import type { ReactiveOption } from './internal/to-reactive'

export interface InjectGenerationOptions<TInput, TResult, TOutput = TResult> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for one-shot generation (no streaming protocol needed) */
  fetcher?: GenerationFetcher<TInput, TResult>
  /** Additional request body params. Reactive. */
  body?: ReactiveOption<Record<string, any>>
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
   * specialized injectable (image / speech / audio / transcription / summarize).
   * Forwarded to the client so a server-hydrate restore repaints `result`.
   */
  reconstructResult?: (restored: GenerationRestoredResult) => TResult | null
}

/**
 * Return type for the injectGeneration function.
 *
 * @template TOutput - The output type (after optional transform)
 * @template TInput - The input type accepted by `generate` (defaults to any object)
 */
export interface InjectGenerationResult<
  TOutput,
  TInput extends Record<string, any> = Record<string, any>,
> {
  /** Trigger a generation request */
  generate: (input: TInput) => Promise<void>
  /** The generation result, or null if not yet generated */
  result: Signal<TOutput | null>
  /** Whether a generation is currently in progress */
  isLoading: Signal<boolean>
  /** Current error, if any */
  error: Signal<Error | undefined>
  /** Current state of the generation client */
  status: Signal<GenerationClientState>
  /** Abort the current generation */
  stop: () => void
  /** Clear result, error, and return to idle */
  reset: () => void
  /** Identity of the in-flight run while one is streaming, or null after it ends */
  runId: Signal<string | null>
}

export function injectGeneration<
  TInput extends Record<string, any>,
  TResult,
  TTransformed = void,
>(
  options: Omit<
    InjectGenerationOptions<TInput, TResult>,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: TResult) => TTransformed
  } & GenerationPersistenceOptions,
): InjectGenerationResult<
  InferGenerationOutputFromReturn<TResult, TTransformed>,
  TInput
> {
  assertInInjectionContext(injectGeneration)

  type TOutput = InferGenerationOutputFromReturn<TResult, TTransformed>

  const destroyRef = inject(DestroyRef)
  const injector = inject(Injector)

  /** The generation result, or null if not yet generated */
  const result = signal<TOutput | null>(null)
  /** Whether a generation is currently in progress */
  const isLoading = signal(false)
  /** Current error, if any */
  const error = signal<Error | undefined>(undefined)
  /** Current state of the generation client */
  const status = signal<GenerationClientState>('idle')
  /**
   * The id of the generation job currently running, or `null` when nothing is in
   * flight. Each call to `generate` is one job with its own id. Pass it to your
   * own endpoint to cancel or poll the provider job — `stop()` only aborts the
   * local stream, it does not stop work already running on the provider.
   */
  const runId = signal<string | null>(null)
  let disposed = false

  const bodySource =
    options.body !== undefined ? toReactive(options.body) : undefined

  const clientOptions: Omit<
    GenerationClientOptions<TInput, TResult, TOutput>,
    'persistence' | 'threadId'
  > = {
    ...(bodySource !== undefined && { body: bodySource() }),
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
      framework: 'angular',
      hookName: 'injectGeneration',
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
      if (!disposed) result.set(r)
    },
    onLoadingChange: (l: boolean) => {
      if (!disposed) isLoading.set(l)
    },
    onErrorChange: (e: Error | undefined) => {
      if (!disposed) error.set(e)
    },
    onStatusChange: (s: GenerationClientState) => {
      if (!disposed) status.set(s)
    },
    onResumeStateChange: (rs) => {
      if (!disposed) runId.set(rs?.runId ?? null)
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
    client = new GenerationClient({
      ...clientOptions,
      ...persistenceProps,
      connection: options.connection,
    })
  } else if (options.fetcher) {
    client = new GenerationClient({
      ...clientOptions,
      ...persistenceProps,
      fetcher: options.fetcher,
    })
  } else {
    throw new Error(
      'injectGeneration requires either a connection or fetcher option',
    )
  }

  if (bodySource) {
    effect(
      () => {
        client.updateOptions({
          body: bodySource(),
        })
      },
      { injector },
    )
  }

  // Mount devtools only. Generation runs are never auto-started after render —
  // persisted state is read-only for display.
  afterNextRender(
    () => {
      client.mountDevtools()
    },
    { injector },
  )
  destroyRef.onDestroy(() => {
    disposed = true
    client.dispose()
  })

  return {
    generate: (input: TInput) => client.generate(input),
    result: result.asReadonly(),
    isLoading: isLoading.asReadonly(),
    error: error.asReadonly(),
    status: status.asReadonly(),
    stop: () => client.stop(),
    reset: () => client.reset(),
    runId: runId.asReadonly(),
  }
}
