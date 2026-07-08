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
  InferGenerationOutputFromReturn,
} from '@tanstack/ai-client'
import type { ReactiveOption } from './internal/to-reactive'

let nextId = 0

export interface InjectGenerationOptions<TInput, TResult, TOutput = TResult> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for one-shot generation (no streaming protocol needed) */
  fetcher?: GenerationFetcher<TInput, TResult>
  /** Unique identifier for this generation instance */
  id?: string
  /** Additional request body params. Reactive. */
  body?: ReactiveOption<Record<string, any>>
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
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

export interface InjectGenerationResult<TOutput> {
  /** Trigger a generation request */
  generate: (input: Record<string, any>) => Promise<void>
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
}

// `TTransformed` infers from the `onResult` return position (a covariant
// inference site that works even for an optional nested property), which types
// the callback parameter as `TResult` and narrows `result`. Inferring the
// whole callback as a defaulted type parameter instead collapses to the
// default, leaving the parameter `any` — a hard error under `strict`. See
// issue #848.
export function injectGeneration<
  TInput extends Record<string, any>,
  TResult,
  TTransformed = void,
>(
  options: Omit<InjectGenerationOptions<TInput, TResult>, 'onResult'> & {
    onResult?: (result: TResult) => TTransformed
  },
): InjectGenerationResult<
  InferGenerationOutputFromReturn<TResult, TTransformed>
> {
  assertInInjectionContext(injectGeneration)

  type TOutput = InferGenerationOutputFromReturn<TResult, TTransformed>

  const destroyRef = inject(DestroyRef)
  const injector = inject(Injector)
  const clientId = options.id || `injectGeneration-${nextId++}`

  const result = signal<TOutput | null>(null)
  const isLoading = signal(false)
  const error = signal<Error | undefined>(undefined)
  const status = signal<GenerationClientState>('idle')

  const bodySource =
    options.body !== undefined ? toReactive(options.body) : undefined

  const clientOptions: GenerationClientOptions<TInput, TResult, TOutput> = {
    id: clientId,
    ...(bodySource !== undefined && { body: bodySource() }),
    devtoolsBridgeFactory: createGenerationDevtoolsBridge,
    devtools: {
      ...options.devtools,
      framework: 'angular',
      hookName: 'injectGeneration',
    },
    // The transform's raw return type (`TTransformed`) and the stored output
    // (`TOutput`, with null/void/undefined stripped) are identical at runtime;
    // the cast bridges the relationship that the conditional type hides.
    onResult: ((r: TResult) => options.onResult?.(r)) as (
      result: TResult,
    ) => TOutput | null | void,
    onError: (e: Error) => options.onError?.(e),
    onProgress: (p: number, m?: string) => options.onProgress?.(p, m),
    onChunk: (c: StreamChunk) => options.onChunk?.(c),
    onResultChange: (r: TOutput | null) => result.set(r),
    onLoadingChange: (l: boolean) => isLoading.set(l),
    onErrorChange: (e: Error | undefined) => error.set(e),
    onStatusChange: (s: GenerationClientState) => status.set(s),
  }

  let client: GenerationClient<TInput, TResult, TOutput>
  if (options.connection) {
    client = new GenerationClient({
      ...clientOptions,
      connection: options.connection,
    })
  } else if (options.fetcher) {
    client = new GenerationClient({
      ...clientOptions,
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
        client.updateOptions({ body: bodySource() })
      },
      { injector },
    )
  }

  afterNextRender(() => client.mountDevtools(), { injector })
  destroyRef.onDestroy(() => client.dispose())

  return {
    generate: ((input: TInput) => client.generate(input)) as (
      input: Record<string, any>,
    ) => Promise<void>,
    result: result.asReadonly(),
    isLoading: isLoading.asReadonly(),
    error: error.asReadonly(),
    status: status.asReadonly(),
    stop: () => client.stop(),
    reset: () => client.reset(),
  }
}
