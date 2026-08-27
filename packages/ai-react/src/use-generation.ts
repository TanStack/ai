import { GenerationClient } from '@tanstack/ai-client'
import { createGenerationDevtoolsBridge } from '@tanstack/ai-client/devtools'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
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

export interface UseGenerationOptions<TInput, TResult, TOutput = TResult> {
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

export interface UseGenerationReturn<
  TOutput,
  TInput extends Record<string, any> = Record<string, any>,
> {
  /** Trigger a generation request */
  generate: (input: TInput) => Promise<void>
  /** The generation result, or null if not yet generated */
  result: TOutput | null
  /** Whether a generation is currently in progress */
  isLoading: boolean
  /** Current error, if any */
  error: Error | undefined
  /** Current state of the generation client */
  status: GenerationClientState
  /** Abort the current generation */
  stop: () => void
  /** Clear result, error, and return to idle */
  reset: () => void
  runId: string | null
}

export function useGeneration<
  TInput extends Record<string, any>,
  TResult,
  TTransformed = void,
>(
  options: Omit<
    UseGenerationOptions<TInput, TResult>,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: TResult) => TTransformed
  } & GenerationPersistenceOptions,
): UseGenerationReturn<
  InferGenerationOutputFromReturn<TResult, TTransformed>,
  TInput
> {
  type TOutput = InferGenerationOutputFromReturn<TResult, TTransformed>
  const hookId = useId()
  // The hook identity is `threadId`. `hookId` is only a React recreation key.
  const clientIdentity = options.threadId ?? hookId

  const [result, setResult] = useState<TOutput | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | undefined>(undefined)
  const [status, setStatus] = useState<GenerationClientState>('idle')
  const [runId, setRunId] = useState<string | null>(null)

  const optionsRef = useRef(options)
  optionsRef.current = options
  const disposedRef = useRef(false)

  const client = useMemo(() => {
    const opts = optionsRef.current

    const clientOptions: Omit<
      GenerationClientOptions<TInput, TResult, TOutput>,
      'persistence' | 'threadId'
    > = {
      body: opts.body,
      ...(opts.hydrateGeneration !== undefined && {
        hydrateGeneration: opts.hydrateGeneration,
      }),
      ...(opts.joinRun !== undefined && { joinRun: opts.joinRun }),
      ...(opts.byok !== undefined && { byok: opts.byok }),
      byokProvider: () => optionsRef.current.byokProvider?.(),
      ...(opts.reconstructResult
        ? { reconstructResult: opts.reconstructResult }
        : {}),
      devtoolsBridgeFactory: createGenerationDevtoolsBridge,
      devtools: {
        hookName: 'useGeneration',
        framework: 'react',
        ...opts.devtools,
      },
      onResult: ((r: TResult) => optionsRef.current.onResult?.(r)) as (
        result: TResult,
      ) => TOutput | null | void,
      onError: (e: Error) => {
        if (!disposedRef.current) optionsRef.current.onError?.(e)
      },
      onProgress: (p: number, m?: string) => {
        if (!disposedRef.current) optionsRef.current.onProgress?.(p, m)
      },
      onChunk: (c: StreamChunk) => {
        if (!disposedRef.current) optionsRef.current.onChunk?.(c)
      },
      onResultChange: (r) => {
        if (!disposedRef.current) setResult(r)
      },
      onLoadingChange: (l) => {
        if (!disposedRef.current) setIsLoading(l)
      },
      onErrorChange: (e) => {
        if (!disposedRef.current) setError(e)
      },
      onStatusChange: (s) => {
        if (!disposedRef.current) setStatus(s)
      },
      onResumeStateChange: (rs) => {
        if (!disposedRef.current) setRunId(rs?.runId ?? null)
      },
    }

    const persistenceProps =
      typeof opts.threadId === 'string' && opts.persistence
        ? {
            persistence: opts.persistence,
            threadId: opts.threadId,
          }
        : {
            ...(opts.threadId !== undefined && { threadId: opts.threadId }),
          }

    if (opts.connection) {
      return new GenerationClient<TInput, TResult, TOutput>({
        ...clientOptions,
        ...persistenceProps,
        connection: opts.connection,
      })
    }

    if (opts.fetcher) {
      return new GenerationClient<TInput, TResult, TOutput>({
        ...clientOptions,
        ...persistenceProps,
        fetcher: opts.fetcher,
      })
    }

    throw new Error(
      'useGeneration requires either a connection or fetcher option',
    )
  }, [clientIdentity, hookId])

  // Sync body changes without recreating client
  useEffect(() => {
    // Conditional spread: target uses strict-optional `body?: T`.
    client.updateOptions({
      ...(options.body !== undefined && { body: options.body }),
    })
  }, [client, options.body])

  useEffect(() => {
    disposedRef.current = false
    client.mountDevtools()

    return () => {
      disposedRef.current = true
      client.dispose()
    }
  }, [client])

  const generate = useCallback(
    async (input: TInput) => {
      await client.generate(input)
    },
    [client],
  )

  const stop = useCallback(() => {
    client.stop()
  }, [client])

  const reset = useCallback(() => {
    client.reset()
  }, [client])

  return {
    generate,
    result,
    isLoading,
    error,
    status,
    stop,
    reset,
    runId,
  }
}
