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
  readonly runId: string | null
}

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
  let result = $state<TOutput | null>(null)
  let isLoading = $state(false)
  let error = $state<Error | undefined>(undefined)
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

  const generate = async (input: TInput) => {
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
    get runId() {
      return runId
    },
  }
}
