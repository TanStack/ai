import { VideoGenerationClient } from '@tanstack/ai-client'
import { createVideoDevtoolsBridge } from '@tanstack/ai-client/devtools'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { StreamChunk } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  GenerationPersistenceOptions,
  InferGenerationOutputFromReturn,
  VideoGenerateInput,
  VideoGenerateResult,
  VideoGenerationClientOptions,
  VideoStatusInfo,
} from '@tanstack/ai-client'
import type { ByokClient } from '@tanstack/ai-client/byok'
import type { ProviderId } from '@tanstack/ai/byok'

export interface UseGenerateVideoOptions<TOutput = VideoGenerateResult> {
  /** Connect-based adapter for streaming transport (server handles polling) */
  connection?: ConnectConnectionAdapter
  /** Direct async function that returns a completed video result */
  fetcher?: GenerationFetcher<VideoGenerateInput, VideoGenerateResult>
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
  onResult?: (result: VideoGenerateResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback when a video job is created */
  onJobCreated?: (jobId: string) => void
  /** Callback on each status update */
  onStatusUpdate?: (status: VideoStatusInfo) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

export interface UseGenerateVideoReturn<TOutput = VideoGenerateResult> {
  /** Trigger video generation */
  generate: (input: VideoGenerateInput) => Promise<void>
  /** The final video result (with URL), or null */
  result: TOutput | null
  /** The current job ID, or null */
  jobId: string | null
  /** Current video generation status info, or null */
  videoStatus: VideoStatusInfo | null
  /** Whether generation/polling is in progress */
  isLoading: boolean
  /** Current error, if any */
  error: Error | undefined
  /** Current state of the generation */
  status: GenerationClientState
  /** Abort the current generation/polling */
  stop: () => void
  /** Clear all state and return to idle */
  reset: () => void
  runId: string | null
}

export function useGenerateVideo<TTransformed = void>(
  options: Omit<
    UseGenerateVideoOptions,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: VideoGenerateResult) => TTransformed
  } & GenerationPersistenceOptions,
): UseGenerateVideoReturn<
  InferGenerationOutputFromReturn<VideoGenerateResult, TTransformed>
> {
  type TOutput = InferGenerationOutputFromReturn<
    VideoGenerateResult,
    TTransformed
  >
  const hookId = useId()
  // The hook identity is `threadId`. `hookId` is only a React recreation key.
  const clientIdentity = options.threadId ?? hookId

  const [result, setResult] = useState<TOutput | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [videoStatus, setVideoStatus] = useState<VideoStatusInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | undefined>(undefined)
  const [status, setStatus] = useState<GenerationClientState>('idle')
  const [runId, setRunId] = useState<string | null>(null)

  const optionsRef = useRef(options)
  optionsRef.current = options
  const disposedRef = useRef(false)

  const client = useMemo(() => {
    const opts = optionsRef.current

    const baseOptions: Omit<
      VideoGenerationClientOptions<TOutput>,
      'persistence' | 'threadId'
    > = {
      body: opts.body,
      ...(opts.hydrateGeneration !== undefined && {
        hydrateGeneration: opts.hydrateGeneration,
      }),
      ...(opts.joinRun !== undefined && { joinRun: opts.joinRun }),
      ...(opts.byok !== undefined && { byok: opts.byok }),
      byokProvider: () => optionsRef.current.byokProvider?.(),
      devtoolsBridgeFactory: createVideoDevtoolsBridge,
      devtools: {
        ...opts.devtools,
        framework: 'react',
        hookName: 'useGenerateVideo',
        outputKind: 'video' as const,
      },
      onResult: ((r: VideoGenerateResult) =>
        optionsRef.current.onResult?.(r)) as (
        result: VideoGenerateResult,
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
      onJobCreated: (id: string) => {
        if (!disposedRef.current) optionsRef.current.onJobCreated?.(id)
      },
      onStatusUpdate: (s: VideoStatusInfo) => {
        if (!disposedRef.current) optionsRef.current.onStatusUpdate?.(s)
      },
      onResultChange: (r: TOutput | null) => {
        if (!disposedRef.current) setResult(r)
      },
      onLoadingChange: (l: boolean) => {
        if (!disposedRef.current) setIsLoading(l)
      },
      onErrorChange: (e: Error | undefined) => {
        if (!disposedRef.current) setError(e)
      },
      onStatusChange: (s: GenerationClientState) => {
        if (!disposedRef.current) setStatus(s)
      },
      onJobIdChange: (id: string | null) => {
        if (!disposedRef.current) setJobId(id)
      },
      onVideoStatusChange: (s: VideoStatusInfo | null) => {
        if (!disposedRef.current) setVideoStatus(s)
      },
      onResumeStateChange: (rs: { runId: string } | null) => {
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
      return new VideoGenerationClient<TOutput>({
        ...baseOptions,
        ...persistenceProps,
        connection: opts.connection,
      })
    }

    if (opts.fetcher) {
      return new VideoGenerationClient<TOutput>({
        ...baseOptions,
        ...persistenceProps,
        fetcher: opts.fetcher,
      })
    }

    throw new Error(
      'useGenerateVideo requires either a connection or fetcher option',
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
    async (input: VideoGenerateInput) => {
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
    jobId,
    videoStatus,
    isLoading,
    error,
    status,
    stop,
    reset,
    runId,
  }
}
