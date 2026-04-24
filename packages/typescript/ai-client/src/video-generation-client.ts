import { GENERATION_EVENTS } from './generation-types'
import { parseSSEResponse } from './sse-parser'
import type { StreamChunk } from '@tanstack/ai'
import type { ConnectConnectionAdapter } from './connection-adapters'
import type {
  GenerationClientState,
  GenerationFetcher,
  VideoGenerateInput,
  VideoGenerateResult,
  VideoGenerationClientOptions,
  VideoStatusInfo,
} from './generation-types'

/**
 * Callbacks stored in a ref so hooks can update them without recreating the client.
 */
interface VideoCallbacks<TOutput> {
  onResult?: (result: VideoGenerateResult) => TOutput | null | void
  onError?: (error: Error) => void
  onProgress?: (progress: number, message?: string) => void
  onChunk?: (chunk: StreamChunk) => void
  onJobCreated?: (jobId: string) => void
  onStatusUpdate?: (status: VideoStatusInfo) => void
  onResultChange?: (result: TOutput | null) => void
  onLoadingChange?: (isLoading: boolean) => void
  onErrorChange?: (error: Error | undefined) => void
  onStatusChange?: (status: GenerationClientState) => void
  onJobIdChange?: (jobId: string | null) => void
  onVideoStatusChange?: (status: VideoStatusInfo | null) => void
}

/**
 * A specialized client for job-based video generation.
 *
 * Video generation is asynchronous: a job is created, then polled for status
 * until completion. This client handles the full lifecycle.
 *
 * Supports two transport modes:
 * - **ConnectConnectionAdapter** — Server handles the polling loop internally and
 *   streams status updates via CUSTOM events.
 * - **Fetcher** — Direct async function that returns a completed
 *   `VideoGenerateResult`.
 *
 * @example
 * ```typescript
 * // With streaming connection adapter (server-driven polling)
 * const client = new VideoGenerationClient({
 *   connection: fetchServerSentEvents('/api/generate/video'),
 *   onResultChange: setResult,
 *   onVideoStatusChange: setVideoStatus,
 * })
 *
 * // With fetcher (direct result)
 * const client = new VideoGenerationClient({
 *   fetcher: async (input) => {
 *     const res = await fetch('/api/video/generate', {
 *       method: 'POST',
 *       body: JSON.stringify(input),
 *     })
 *     return res.json() // { jobId, status: 'completed', url, expiresAt }
 *   },
 * })
 *
 * await client.generate({ prompt: 'A flying car over a city' })
 * ```
 */
export class VideoGenerationClient<TOutput = VideoGenerateResult> {
  private connection: ConnectConnectionAdapter | undefined
  private fetcher:
    | GenerationFetcher<VideoGenerateInput, VideoGenerateResult>
    | undefined
  private body: Record<string, any>

  private result: TOutput | null = null
  private jobId: string | null = null
  private videoStatus: VideoStatusInfo | null = null
  private isLoading = false
  private error: Error | undefined = undefined
  private status: GenerationClientState = 'idle'
  private abortController: AbortController | null = null
  private callbacksRef: VideoCallbacks<TOutput>

  constructor(
    options: VideoGenerationClientOptions<TOutput> &
      (
        | { connection: ConnectConnectionAdapter; fetcher?: never }
        | {
            fetcher: GenerationFetcher<VideoGenerateInput, VideoGenerateResult>
            connection?: never
          }
      ),
  ) {
    this.connection = options.connection
    this.fetcher = options.fetcher
    this.body = options.body ?? {}

    this.callbacksRef = {
      onResult: options.onResult,
      onError: options.onError,
      onProgress: options.onProgress,
      onChunk: options.onChunk,
      onJobCreated: options.onJobCreated,
      onStatusUpdate: options.onStatusUpdate,
      onResultChange: options.onResultChange,
      onLoadingChange: options.onLoadingChange,
      onErrorChange: options.onErrorChange,
      onStatusChange: options.onStatusChange,
      onJobIdChange: options.onJobIdChange,
      onVideoStatusChange: options.onVideoStatusChange,
    }
  }

  /**
   * Trigger video generation.
   * Only one generation can be in-flight at a time.
   */
  async generate(input: VideoGenerateInput): Promise<void> {
    if (this.isLoading) return

    this.setIsLoading(true)
    this.setStatus('generating')
    this.setError(undefined)
    this.setJobId(null)
    this.setVideoStatus(null)

    const abortController = new AbortController()
    this.abortController = abortController
    const { signal } = abortController

    try {
      if (this.fetcher) {
        await this.generateWithFetcher(input, signal)
      } else if (this.connection) {
        const mergedData = { ...this.body, ...input }
        const stream = this.connection.connect([], mergedData, signal)
        await this.processStream(stream)
      } else {
        throw new Error(
          'VideoGenerationClient requires either a connection or fetcher option',
        )
      }
    } catch (err: any) {
      if (signal.aborted) return
      const error = err instanceof Error ? err : new Error(String(err))
      this.setError(error)
      this.setStatus('error')
      this.callbacksRef.onError?.(error)
    } finally {
      this.abortController = null
      this.setIsLoading(false)
    }
  }

  /**
   * Direct fetcher mode: call fetcher and set result.
   */
  private async generateWithFetcher(
    input: VideoGenerateInput,
    signal: AbortSignal,
  ): Promise<void> {
    if (!this.fetcher) return

    // Fetcher returns a completed result directly, or a Response with SSE body
    const result = await this.fetcher(input, { signal })
    if (signal.aborted) return

    if (result instanceof Response) {
      // Server function returned SSE Response — parse stream
      await this.processStream(parseSSEResponse(result, signal))
    } else {
      this.setResult(result)
      this.setStatus('success')
    }
  }

  /**
   * Process a stream of AG-UI events from the streaming connection adapter.
   * The server handles the polling loop and streams status updates.
   */
  private async processStream(
    source: AsyncIterable<StreamChunk>,
  ): Promise<void> {
    for await (const chunk of source) {
      if (this.abortController?.signal.aborted) break

      this.callbacksRef.onChunk?.(chunk)

      switch (chunk.type) {
        case 'CUSTOM': {
          if (chunk.name === GENERATION_EVENTS.VIDEO_JOB_CREATED) {
            const { jobId } = chunk.value as { jobId: string }
            this.setJobId(jobId)
            this.callbacksRef.onJobCreated?.(jobId)
          } else if (chunk.name === GENERATION_EVENTS.VIDEO_STATUS) {
            const statusInfo = chunk.value as VideoStatusInfo
            this.setVideoStatus(statusInfo)
            this.callbacksRef.onStatusUpdate?.(statusInfo)
            if (statusInfo.progress !== undefined) {
              this.callbacksRef.onProgress?.(statusInfo.progress)
            }
          } else if (chunk.name === GENERATION_EVENTS.RESULT) {
            this.setResult(chunk.value as VideoGenerateResult)
          } else if (chunk.name === GENERATION_EVENTS.PROGRESS) {
            const { progress, message } = chunk.value as {
              progress: number
              message?: string
            }
            this.callbacksRef.onProgress?.(progress, message)
          }
          break
        }
        case 'RUN_FINISHED': {
          this.setStatus('success')
          break
        }
        case 'RUN_ERROR': {
          // Prefer spec `message`; fall back to deprecated `error.message`
          const msg =
            (chunk.message as string | undefined) ||
            chunk.error?.message ||
            'An error occurred'
          throw new Error(msg)
        }
      }
    }
  }

  /**
   * Abort any in-flight generation or polling.
   */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.setIsLoading(false)
    if (this.status === 'generating') {
      this.setStatus('idle')
    }
  }

  /**
   * Clear all state and return to idle.
   */
  reset(): void {
    this.stop()
    this.setResult(null)
    this.setJobId(null)
    this.setVideoStatus(null)
    this.setError(undefined)
    this.setStatus('idle')
  }

  /**
   * Update options without recreating the client.
   */
  updateOptions(
    options: Partial<
      Pick<
        VideoGenerationClientOptions<TOutput>,
        | 'body'
        | 'onResult'
        | 'onError'
        | 'onProgress'
        | 'onChunk'
        | 'onJobCreated'
        | 'onStatusUpdate'
      >
    >,
  ): void {
    if (options.body !== undefined) {
      this.body = options.body ?? {}
    }
    if (options.onResult !== undefined) {
      this.callbacksRef.onResult = options.onResult
    }
    if (options.onError !== undefined) {
      this.callbacksRef.onError = options.onError
    }
    if (options.onProgress !== undefined) {
      this.callbacksRef.onProgress = options.onProgress
    }
    if (options.onChunk !== undefined) {
      this.callbacksRef.onChunk = options.onChunk
    }
    if (options.onJobCreated !== undefined) {
      this.callbacksRef.onJobCreated = options.onJobCreated
    }
    if (options.onStatusUpdate !== undefined) {
      this.callbacksRef.onStatusUpdate = options.onStatusUpdate
    }
  }

  // ===========================
  // Getters
  // ===========================

  getResult(): TOutput | null {
    return this.result
  }

  getJobId(): string | null {
    return this.jobId
  }

  getVideoStatus(): VideoStatusInfo | null {
    return this.videoStatus
  }

  getIsLoading(): boolean {
    return this.isLoading
  }

  getError(): Error | undefined {
    return this.error
  }

  getStatus(): GenerationClientState {
    return this.status
  }

  // ===========================
  // Private state setters
  // ===========================

  private setResult(rawResult: VideoGenerateResult | null): void {
    if (rawResult === null) {
      this.result = null
      this.callbacksRef.onResultChange?.(null)
      return
    }

    if (this.callbacksRef.onResult) {
      const transformed = this.callbacksRef.onResult(rawResult)
      if (transformed === null) {
        // null return → keep previous result unchanged
        return
      }
      if (transformed !== undefined) {
        // Non-null, non-undefined → use transformed value
        this.result = transformed
        this.callbacksRef.onResultChange?.(this.result)
        return
      }
    }

    // No onResult callback, or callback returned void → use raw value
    this.result = rawResult as unknown as TOutput
    this.callbacksRef.onResultChange?.(this.result)
  }

  private setJobId(jobId: string | null): void {
    this.jobId = jobId
    this.callbacksRef.onJobIdChange?.(jobId)
  }

  private setVideoStatus(status: VideoStatusInfo | null): void {
    this.videoStatus = status
    this.callbacksRef.onVideoStatusChange?.(status)
  }

  private setIsLoading(isLoading: boolean): void {
    this.isLoading = isLoading
    this.callbacksRef.onLoadingChange?.(isLoading)
  }

  private setError(error: Error | undefined): void {
    this.error = error
    this.callbacksRef.onErrorChange?.(error)
  }

  private setStatus(status: GenerationClientState): void {
    this.status = status
    this.callbacksRef.onStatusChange?.(status)
  }
}
