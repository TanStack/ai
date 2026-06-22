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
  InferGenerationOutput,
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
}

export function injectGenerateVideo<
  TOnResult extends ((result: VideoGenerateResult) => any) | undefined =
    undefined,
>(
  options: Omit<InjectGenerateVideoOptions, 'onResult'> & {
    onResult?: TOnResult
  },
): InjectGenerateVideoResult<
  InferGenerationOutput<VideoGenerateResult, TOnResult>
> {
  assertInInjectionContext(injectGenerateVideo)

  type TOutput = InferGenerationOutput<VideoGenerateResult, TOnResult>

  const destroyRef = inject(DestroyRef)
  const injector = inject(Injector)
  const clientId = options.id || `injectGenerateVideo-${nextId++}`

  const result = signal<TOutput | null>(null)
  const jobId = signal<string | null>(null)
  const videoStatus = signal<VideoStatusInfo | null>(null)
  const isLoading = signal(false)
  const error = signal<Error | undefined>(undefined)
  const status = signal<GenerationClientState>('idle')

  const bodySource =
    options.body !== undefined ? toReactive(options.body) : undefined

  const baseOptions = {
    id: clientId,
    ...(bodySource !== undefined && { body: bodySource() }),
    devtoolsBridgeFactory: createVideoDevtoolsBridge,
    devtools: {
      ...options.devtools,
      framework: 'angular',
      hookName: 'injectGenerateVideo',
      outputKind: 'video' as const,
    },
    onResult: (r: VideoGenerateResult) => options.onResult?.(r),
    onError: (e: Error) => options.onError?.(e),
    onProgress: (p: number, m?: string) => options.onProgress?.(p, m),
    onChunk: (c: StreamChunk) => options.onChunk?.(c),
    onJobCreated: (id: string) => options.onJobCreated?.(id),
    onStatusUpdate: (s: VideoStatusInfo) => options.onStatusUpdate?.(s),
    onResultChange: (r: TOutput | null) => result.set(r),
    onLoadingChange: (l: boolean) => isLoading.set(l),
    onErrorChange: (e: Error | undefined) => error.set(e),
    onStatusChange: (s: GenerationClientState) => status.set(s),
    onJobIdChange: (id: string | null) => jobId.set(id),
    onVideoStatusChange: (s: VideoStatusInfo | null) => videoStatus.set(s),
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
        client.updateOptions({ body: bodySource() })
      },
      { injector },
    )
  }

  afterNextRender(() => client.mountDevtools(), { injector })
  destroyRef.onDestroy(() => client.dispose())

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
  }
}
