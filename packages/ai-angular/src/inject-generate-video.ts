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
import type { ByokClient } from '@tanstack/ai-client/byok'
import type { ProviderId } from '@tanstack/ai/byok'
import type { StreamChunk } from '@tanstack/ai'

export interface InjectGenerateVideoOptions<TOutput = VideoGenerateResult> {
  connection?: ConnectConnectionAdapter
  fetcher?: GenerationFetcher<VideoGenerateInput, VideoGenerateResult>
  body?: ReactiveOption<Record<string, any>>
  /** Optional BYOK keyring. Keys go in `x-byok-*` headers, never the body. */
  byok?: ByokClient
  /** Optional provider id. If it returns a slug, only that key is sent. If no slug resolves (`byokProvider`, then `body.provider`), generate throws. */
  byokProvider?: () => ProviderId | undefined
  devtools?: AIDevtoolsDisplayOptions
  persistence?: boolean
  threadId?: string
  hydrateGeneration?: ConnectConnectionAdapter['hydrateGeneration']
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
  runId: Signal<string | null>
}

export function injectGenerateVideo<TTransformed = void>(
  options: Omit<
    InjectGenerateVideoOptions,
    'onResult' | 'persistence' | 'threadId'
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

  const baseOptions = {
    ...(bodySource !== undefined && { body: bodySource() }),
    ...(typeof options.threadId === 'string' && options.persistence
      ? {
          persistence: options.persistence,
          threadId: options.threadId,
        }
      : {
          ...(options.threadId !== undefined && {
            threadId: options.threadId,
          }),
        }),
    ...(options.hydrateGeneration !== undefined && {
      hydrateGeneration: options.hydrateGeneration,
    }),
    ...(options.joinRun !== undefined && { joinRun: options.joinRun }),
    ...(options.byok !== undefined && { byok: options.byok }),
    byokProvider: () => options.byokProvider?.(),
    devtoolsBridgeFactory: createVideoDevtoolsBridge,
    devtools: {
      ...options.devtools,
      framework: 'angular',
      hookName: 'injectGenerateVideo',
      outputKind: 'video' as const,
    },
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
