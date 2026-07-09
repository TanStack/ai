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
  GenerationPendingArtifact,
  GenerationPersistenceOptions,
  GenerationResumeSnapshot,
  GenerationResumeState,
  InferGenerationOutputFromReturn,
  VideoGenerateInput,
  VideoGenerateResult,
  VideoStatusInfo,
} from '@tanstack/ai-client'
import type { StreamChunk } from '@tanstack/ai'
import type { PersistedArtifactRef } from '@tanstack/ai/client'

let nextId = 0

export interface InjectGenerateVideoOptions<TOutput = VideoGenerateResult> {
  connection?: ConnectConnectionAdapter
  fetcher?: GenerationFetcher<VideoGenerateInput, VideoGenerateResult>
  id?: string
  body?: ReactiveOption<Record<string, any>>
  devtools?: AIDevtoolsDisplayOptions
  persistence?: GenerationPersistenceOptions
  initialResumeSnapshot?: GenerationResumeSnapshot
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
  resumeSnapshot: Signal<GenerationResumeSnapshot | undefined>
  resumeState: Signal<GenerationResumeState | null>
  pendingArtifacts: Signal<Array<GenerationPendingArtifact>>
  resultArtifacts: Signal<Array<PersistedArtifactRef>>
}

// `TTransformed` infers from the `onResult` return position so the callback
// parameter is typed as `VideoGenerateResult` and `result` narrows to the
// transform's return. See issue #848.
export function injectGenerateVideo<TTransformed = void>(
  options: Omit<InjectGenerateVideoOptions, 'onResult'> & {
    onResult?: (result: VideoGenerateResult) => TTransformed
  },
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
  const clientId = options.id || `injectGenerateVideo-${nextId++}`

  const result = signal<TOutput | null>(null)
  const jobId = signal<string | null>(null)
  const videoStatus = signal<VideoStatusInfo | null>(null)
  const isLoading = signal(false)
  const error = signal<Error | undefined>(undefined)
  const status = signal<GenerationClientState>('idle')
  const resumeSnapshot = signal<GenerationResumeSnapshot | undefined>(
    options.initialResumeSnapshot,
  )
  const resumeState = signal<GenerationResumeState | null>(
    options.initialResumeSnapshot?.resumeState ?? null,
  )
  const pendingArtifacts = signal<Array<GenerationPendingArtifact>>(
    options.initialResumeSnapshot?.pendingArtifacts ?? [],
  )
  const resultArtifacts = signal<Array<PersistedArtifactRef>>(
    options.initialResumeSnapshot?.result?.artifacts ?? [],
  )
  let disposed = false

  const setResumeSnapshotState = (
    snapshot: GenerationResumeSnapshot | undefined,
  ) => {
    if (disposed) return
    resumeSnapshot.set(snapshot)
    resumeState.set(snapshot?.resumeState ?? null)
    pendingArtifacts.set(snapshot?.pendingArtifacts ?? [])
    resultArtifacts.set(snapshot?.result?.artifacts ?? [])
  }

  const bodySource =
    options.body !== undefined ? toReactive(options.body) : undefined

  const baseOptions = {
    id: clientId,
    ...(bodySource !== undefined && { body: bodySource() }),
    ...(options.persistence !== undefined && {
      persistence: options.persistence,
    }),
    ...(options.initialResumeSnapshot !== undefined && {
      initialResumeSnapshot: options.initialResumeSnapshot,
    }),
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
    onResumeSnapshotChange: setResumeSnapshotState,
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
    resumeSnapshot: resumeSnapshot.asReadonly(),
    resumeState: resumeState.asReadonly(),
    pendingArtifacts: pendingArtifacts.asReadonly(),
    resultArtifacts: resultArtifacts.asReadonly(),
  }
}
