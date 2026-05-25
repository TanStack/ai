import { GENERATION_EVENTS } from './generation-types'
import { createNoOpVideoDevtoolsBridge } from './devtools-noop'
import { parseSSEResponse } from './sse-parser'
import type { StreamChunk } from '@tanstack/ai'
import type {
  ConnectConnectionAdapter,
  RunAgentInputContext,
} from './connection-adapters'
import type {
  AIDevtoolsClientMetadata,
  AIDevtoolsGenerationProgress,
  VideoDevtoolsBridge,
  VideoDevtoolsBridgeOptions,
} from './devtools'
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
// All optional fields explicitly allow `| undefined` so callers can spread
// option bags (where each callback may be `undefined`) into the callbacks
// ref under `exactOptionalPropertyTypes`.
interface VideoCallbacks<TOutput> {
  onResult?:
    | ((result: VideoGenerateResult) => TOutput | null | void)
    | undefined
  onError?: ((error: Error) => void) | undefined
  onProgress?: ((progress: number, message?: string) => void) | undefined
  onChunk?: ((chunk: StreamChunk) => void) | undefined
  onJobCreated?: ((jobId: string) => void) | undefined
  onStatusUpdate?: ((status: VideoStatusInfo) => void) | undefined
  onResultChange?: ((result: TOutput | null) => void) | undefined
  onLoadingChange?: ((isLoading: boolean) => void) | undefined
  onErrorChange?: ((error: Error | undefined) => void) | undefined
  onStatusChange?: ((status: GenerationClientState) => void) | undefined
  onJobIdChange?: ((jobId: string | null) => void) | undefined
  onVideoStatusChange?: ((status: VideoStatusInfo | null) => void) | undefined
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
  private readonly connection: ConnectConnectionAdapter | undefined
  private readonly fetcher:
    | GenerationFetcher<VideoGenerateInput, VideoGenerateResult>
    | undefined
  private readonly uniqueId: string
  private readonly devtoolsMetadata: AIDevtoolsClientMetadata
  private readonly devtoolsBridge: VideoDevtoolsBridge<TOutput>
  private readonly threadId: string
  private body: Record<string, any>

  private result: TOutput | null = null
  private input: VideoGenerateInput | null = null
  private progress: AIDevtoolsGenerationProgress | null = null
  private jobId: string | null = null
  private videoStatus: VideoStatusInfo | null = null
  private isLoading = false
  private error: Error | undefined = undefined
  private status: GenerationClientState = 'idle'
  private abortController: AbortController | null = null
  private readonly callbacksRef: VideoCallbacks<TOutput>
  private devtoolsMounted = false

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
    this.uniqueId = options.id ?? this.generateUniqueId('video')
    this.threadId = this.uniqueId
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

    this.devtoolsMetadata = this.createDevtoolsMetadata(options.devtools)
    this.devtoolsBridge = (
      options.devtoolsBridgeFactory ?? createNoOpVideoDevtoolsBridge
    )<TOutput>(this.buildDevtoolsBridgeOptions())
  }

  private buildDevtoolsBridgeOptions(): VideoDevtoolsBridgeOptions<TOutput> {
    return {
      hookId: this.uniqueId,
      clientId: this.uniqueId,
      threadId: this.threadId,
      metadata: this.devtoolsMetadata,
      getCoreState: () => ({
        input: this.input,
        result: this.result,
        progress: this.progress,
        status: this.status,
        isLoading: this.isLoading,
        jobId: this.jobId,
        videoStatus: this.videoStatus,
        ...(this.error ? { error: this.error.message } : {}),
      }),
    }
  }

  mountDevtools(): void {
    if (this.devtoolsMounted) {
      return
    }

    this.devtoolsMounted = true
    this.devtoolsBridge.emitRegistered()
    this.devtoolsBridge.emitSnapshot()
  }

  /**
   * Trigger video generation.
   * Only one generation can be in-flight at a time.
   */
  async generate(input: VideoGenerateInput): Promise<void> {
    this.mountDevtools()
    if (this.isLoading) return

    this.input = input
    this.progress = null
    const runId = this.devtoolsBridge.beginRun(input)
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
        await this.generateWithFetcher(input, signal, runId)
      } else if (this.connection) {
        const mergedData = { ...this.body, ...input }
        const stream = this.connection.connect(
          [],
          mergedData,
          signal,
          this.createRunContext(runId),
        )
        await this.processStream(stream, runId)
      } else {
        throw new Error(
          'VideoGenerationClient requires either a connection or fetcher option',
        )
      }
      if (!signal.aborted && this.status === 'success') {
        this.devtoolsBridge.finishRun(
          this.devtoolsBridge.getActiveRunId() ?? runId,
          'run:completed',
          'completed',
        )
      }
    } catch (err: unknown) {
      if (signal.aborted) return
      const error = err instanceof Error ? err : new Error(String(err))
      this.setError(error)
      this.setStatus('error')
      this.devtoolsBridge.finishRun(
        this.devtoolsBridge.getActiveRunId() ?? runId,
        'run:errored',
        'errored',
        error.message,
      )
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
    runId: string,
  ): Promise<void> {
    if (!this.fetcher) return

    // Fetcher returns a completed result directly, or a Response with SSE body
    const result = await this.fetcher(input, { signal })
    if (signal.aborted) return

    if (result instanceof Response) {
      // Server function returned SSE Response — parse stream
      await this.processStream(parseSSEResponse(result, signal), runId)
    } else {
      this.devtoolsBridge.ensureRunStarted(runId)
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
    fallbackRunId: string,
  ): Promise<void> {
    let streamRunId: string | undefined

    for await (const chunk of source) {
      if (this.abortController?.signal.aborted) break

      this.callbacksRef.onChunk?.(chunk)
      const chunkRunId =
        'runId' in chunk && typeof chunk.runId === 'string'
          ? chunk.runId
          : undefined

      // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- AG-UI EventType has ~22 variants; this consumer only handles the subset relevant to video generation lifecycle.
      switch (chunk.type) {
        case 'RUN_STARTED': {
          streamRunId = chunk.runId
          this.devtoolsBridge.ensureRunStarted(chunk.runId)
          break
        }
        case 'CUSTOM': {
          this.devtoolsBridge.ensureRunStarted(streamRunId ?? fallbackRunId)
          if (chunk.name === GENERATION_EVENTS.VIDEO_JOB_CREATED) {
            const { jobId } = chunk.value as { jobId: string }
            this.setJobId(jobId)
            this.callbacksRef.onJobCreated?.(jobId)
          } else if (chunk.name === GENERATION_EVENTS.VIDEO_STATUS) {
            const statusInfo = chunk.value as VideoStatusInfo
            this.setVideoStatus(statusInfo)
            this.callbacksRef.onStatusUpdate?.(statusInfo)
            if (statusInfo.progress !== undefined) {
              this.setProgress(statusInfo.progress)
            }
          } else if (chunk.name === GENERATION_EVENTS.RESULT) {
            this.setResult(chunk.value as VideoGenerateResult)
          } else if (chunk.name === GENERATION_EVENTS.PROGRESS) {
            const { progress, message } = chunk.value as {
              progress: number
              message?: string
            }
            this.setProgress(progress, message)
          }
          break
        }
        case 'RUN_FINISHED': {
          streamRunId = chunk.runId
          this.devtoolsBridge.ensureRunStarted(chunk.runId)
          this.setStatus('success')
          break
        }
        case 'RUN_ERROR': {
          this.devtoolsBridge.ensureRunStarted(
            chunkRunId ?? streamRunId ?? fallbackRunId,
          )
          // Prefer spec `message`; fall back to deprecated `error.message`
          const msg =
            (chunk.message as string | undefined) ||
            chunk.error?.message ||
            'An error occurred'
          throw new Error(msg)
        }
        default:
          break
      }
    }
  }

  /**
   * Abort any in-flight generation or polling.
   */
  stop(): void {
    const runId = this.devtoolsBridge.getActiveRunId()
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.setIsLoading(false)
    if (this.status === 'generating') {
      this.setStatus('idle')
      if (runId) {
        this.devtoolsBridge.finishRun(runId, 'run:cancelled', 'cancelled')
      }
    }
  }

  /**
   * Clear all state and return to idle.
   */
  reset(): void {
    this.stop()
    this.setResult(null)
    this.input = null
    this.progress = null
    this.devtoolsBridge.resetRuns()
    this.setJobId(null)
    this.setVideoStatus(null)
    this.setError(undefined)
    this.setStatus('idle')
    this.devtoolsBridge.emitState()
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

  dispose(): void {
    this.stop()
    this.devtoolsBridge.dispose()
    this.devtoolsMounted = false
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
      this.devtoolsBridge.recordResultChange()
      return
    }

    const completedStatus = this.createCompletedVideoStatus(rawResult)
    if (this.progress?.value !== 100) {
      this.setProgress(100, this.progress?.message)
    }
    this.setJobId(rawResult.jobId)
    this.setVideoStatus(completedStatus)

    if (this.callbacksRef.onResult) {
      const transformed = this.callbacksRef.onResult(rawResult)
      if (transformed === null) {
        // null return → keep previous result unchanged, just re-emit
        this.devtoolsBridge.emitState()
        return
      }
      if (transformed !== undefined) {
        // Non-null, non-undefined → use transformed value
        this.result = transformed
        this.callbacksRef.onResultChange?.(this.result)
        this.devtoolsBridge.recordResultChange()
        return
      }
    }

    // No onResult callback, or callback returned void → use raw value as
    // TOutput. When the caller did not supply an onResult transform,
    // `TOutput` defaults to `VideoGenerateResult`, so the runtime cast is
    // sound.
    this.result = rawResult as unknown as TOutput
    this.callbacksRef.onResultChange?.(this.result)
    this.devtoolsBridge.recordResultChange()
  }

  private setJobId(jobId: string | null): void {
    this.jobId = jobId
    this.callbacksRef.onJobIdChange?.(jobId)
    this.devtoolsBridge.recordJobIdChange()
  }

  private setVideoStatus(status: VideoStatusInfo | null): void {
    this.videoStatus = status
    this.callbacksRef.onVideoStatusChange?.(status)
    this.devtoolsBridge.recordVideoStatusChange()
  }

  private setIsLoading(isLoading: boolean): void {
    this.isLoading = isLoading
    this.callbacksRef.onLoadingChange?.(isLoading)
    this.devtoolsBridge.recordLoadingChange()
  }

  private setError(error: Error | undefined): void {
    this.error = error
    this.callbacksRef.onErrorChange?.(error)
    this.devtoolsBridge.recordErrorChange(error)
  }

  private setStatus(status: GenerationClientState): void {
    this.status = status
    this.callbacksRef.onStatusChange?.(status)
    this.devtoolsBridge.recordStatusChange(status)
  }

  private setProgress(value: number, message?: string): void {
    this.progress = {
      value,
      ...(message ? { message } : {}),
    }
    if (message === undefined) {
      this.callbacksRef.onProgress?.(value)
    } else {
      this.callbacksRef.onProgress?.(value, message)
    }
    this.devtoolsBridge.recordProgressChange()
  }

  private createCompletedVideoStatus(
    result: VideoGenerateResult,
  ): VideoStatusInfo {
    return {
      jobId: result.jobId,
      status: result.status,
      progress: 100,
      url: result.url,
    }
  }


  private createDevtoolsMetadata(
    metadata?: Partial<AIDevtoolsClientMetadata>,
  ): AIDevtoolsClientMetadata {
    return {
      hookName: metadata?.hookName ?? 'useGenerateVideo',
      outputKind: metadata?.outputKind ?? 'video',
      ...(metadata?.framework ? { framework: metadata.framework } : {}),
      ...(metadata?.name ? { name: metadata.name } : {}),
    }
  }

  private generateUniqueId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }

  private createRunContext(runId: string): RunAgentInputContext {
    return {
      threadId: this.threadId,
      runId,
    }
  }
}
