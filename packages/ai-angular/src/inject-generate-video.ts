import { VideoGenerationClient } from '@tanstack/ai-client'
import { createVideoDevtoolsBridge } from '@tanstack/ai-client/devtools'
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
import type { ReactiveOption } from './internal/to-reactive'
import type {
  AIDevtoolsDisplayOptions,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  GenerationPersistenceOptions,
  InferGenerationOutputFromReturn,
  VideoGenerateInput,
  VideoGenerateResult,
  VideoStatusInfo,
} from '@tanstack/ai-client'
import type { StreamChunk } from '@tanstack/ai'

let nextId = 0

export interface InjectGenerateVideoOptions<TOutput = VideoGenerateResult> {
  connection?: ConnectConnectionAdapter
  fetcher?: GenerationFetcher<VideoGenerateInput, VideoGenerateResult>
  id?: string
  body?: ReactiveOption<Record<string, any>>
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
   * scope has nothing to restore to. Optional for ephemeral generations, where
   * it falls back to `id` purely to satisfy the wire.
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
  onResult?: (result: VideoGenerateResult) => TOutput | null | void
  onError?: (error: Error) => void
  onProgress?: (progress: number, message?: string) => void
  onJobCreated?: (jobId: string) => void
  onStatusUpdate?: (status: VideoStatusInfo) => void
  onChunk?: (chunk: StreamChunk) => void
}

export interface InjectGenerateVideoResult<TOutput = VideoGenerateResult> {
  generate: (input: VideoGenerateInput) => Promise<void>
  result: Signal<TOutput | null>
  jobId: Signal<string | null>
  videoStatus: Signal<VideoStatusInfo | null>
  isLoading: Signal<boolean>
  error: Signal<Error | undefined>
  status: Signal<GenerationClientState>
  stop: () => void
  reset: () => void
  /**
   * The id of the generation job currently running, or `null` when nothing is in
   * flight. Each call to `generate` is one job with its own id. Pass it to your
   * own endpoint to cancel or poll the provider job — `stop()` only aborts the
   * local stream, it does not stop work already running on the provider.
   */
  runId: Signal<string | null>
}

// `TTransformed` infers from the `onResult` return position so the callback
// parameter is typed as `VideoGenerateResult` and `result` narrows to the
// transform's return. See issue #848.
export function injectGenerateVideo<TTransformed = void>(
  options: Omit<
    InjectGenerateVideoOptions,
    'onResult' | 'persistence' | 'threadId' | 'id'
  > & {
    onResult?: (result: VideoGenerateResult) => TTransformed
  } & GenerationPersistenceOptions,
): InjectGenerateVideoResult<
  InferGenerationOutputFromReturn<VideoGenerateResult, TTransformed>
> {
  assertInInjectionContext(injectGenerateVideo)

  type TOutput = InferGenerationOutputFromReturn<
    VideoGenerateResult,
    TTransformed
  >

  const destroyRef = inject(DestroyRef)
  const injector = inject(Injector)

  const result = signal<TOutput | null>(null)
  const jobId = signal<string | null>(null)
  const videoStatus = signal<VideoStatusInfo | null>(null)
  const isLoading = signal(false)
  const error = signal<Error | undefined>(undefined)
  const status = signal<GenerationClientState>('idle')
  const runId = signal<string | null>(null)
  let disposed = false

  const bodySource =
    options.body !== undefined ? toReactive(options.body) : undefined

  // Identity: pass `threadId` alone when set (never also pass deprecated `id`).
  const baseOptions = {
    ...(bodySource !== undefined && { body: bodySource() }),
    ...(options.threadId !== undefined
      ? { threadId: options.threadId }
      : { id: options.id ?? `injectGenerateVideo-${nextId++}` }),
    ...(options.persistence !== undefined && {
      persistence: options.persistence,
    }),
    ...(options.hydrateGeneration !== undefined && {
      hydrateGeneration: options.hydrateGeneration,
    }),
    ...(options.joinRun !== undefined && { joinRun: options.joinRun }),
    devtoolsBridgeFactory: createVideoDevtoolsBridge,
    devtools: {
      ...options.devtools,
      framework: 'angular',
      hookName: 'injectGenerateVideo',
      outputKind: 'video' as const,
    },
    // The transform's raw return type (`TTransformed`) and the stored output
    // (`TOutput`, with null/void/undefined stripped) are identical at runtime;
    // the cast bridges the relationship that the conditional type hides.
    onResult: ((r: VideoGenerateResult) => options.onResult?.(r)) as (
      result: VideoGenerateResult,
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
    onJobCreated: (id: string) => {
      if (!disposed) options.onJobCreated?.(id)
    },
    onStatusUpdate: (s: VideoStatusInfo) => {
      if (!disposed) options.onStatusUpdate?.(s)
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
    onJobIdChange: (id: string | null) => {
      if (!disposed) jobId.set(id)
    },
    onVideoStatusChange: (s: VideoStatusInfo | null) => {
      if (!disposed) videoStatus.set(s)
    },
    onResumeStateChange: (rs: { runId: string } | null) => {
      if (!disposed) runId.set(rs?.runId ?? null)
    },
  }

  let client: VideoGenerationClient<TOutput>
  if (options.connection) {
    client = new VideoGenerationClient({
      ...baseOptions,
      connection: options.connection,
    })
  } else if (options.fetcher) {
    client = new VideoGenerationClient({
      ...baseOptions,
      fetcher: options.fetcher,
    })
  } else {
    throw new Error(
      'injectGenerateVideo requires either a connection or fetcher option',
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
    generate: (input: VideoGenerateInput) => client.generate(input),
    result: result.asReadonly(),
    jobId: jobId.asReadonly(),
    videoStatus: videoStatus.asReadonly(),
    isLoading: isLoading.asReadonly(),
    error: error.asReadonly(),
    status: status.asReadonly(),
    stop: () => client.stop(),
    reset: () => client.reset(),
    runId: runId.asReadonly(),
  }
}
