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
  persistence?: boolean
  threadId?: string
  hydrateGeneration?: ConnectConnectionAdapter['hydrateGeneration']
  joinRun?: ConnectConnectionAdapter['joinRun']
  onResult?: (result: TResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
  reconstructResult?: (restored: GenerationRestoredResult) => TResult | null
}

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

  const result = signal<TOutput | null>(null)
  const isLoading = signal(false)
  const error = signal<Error | undefined>(undefined)
  const status = signal<GenerationClientState>('idle')
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
