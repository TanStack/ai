import {
  GENERATION_EVENTS,
  GENERATION_STREAM_TRUNCATED_MESSAGE,
  GENERATION_UNRESTORABLE_RESULT_MESSAGE,
  clientStateFromResumeStatus,
  createGenerationHydrationError,
  createGenerationResultSnapshot,
  parseGenerationResumeSnapshot,
  updateGenerationResumeSnapshot,
} from './generation-types'
import { createNoOpVideoDevtoolsBridge } from './devtools-noop'
import { parseSSEResponse } from './sse-parser'
import type { StreamChunk } from '@tanstack/ai/client'
import type {
  ConnectConnectionAdapter,
  GenerationHydrationResult,
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
  GenerationPersistenceOptions,
  GenerationResumeSnapshot,
  GenerationResumeState,
  GenerationTransport,
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
  onResumeSnapshotChange?:
    | ((snapshot: GenerationResumeSnapshot | undefined) => void)
    | undefined
  onResumeStateChange?:
    | ((resumeState: GenerationResumeState | null) => void)
    | undefined
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
  // Persistence handlers supplied as options (e.g. alongside a `fetcher`), used
  // when the connection doesn't carry its own — the connection's handlers take
  // precedence when both exist.
  private readonly hydrateGenerationHandler:
    | ConnectConnectionAdapter['hydrateGeneration']
    | undefined
  private readonly joinRunHandler:
    | ConnectConnectionAdapter['joinRun']
    | undefined
  private readonly fetcher:
    | GenerationFetcher<VideoGenerateInput, VideoGenerateResult>
    | undefined
  private uniqueId: string
  private readonly devtoolsMetadata: AIDevtoolsClientMetadata
  private readonly devtoolsBridge: VideoDevtoolsBridge<TOutput>
  private threadId: string
  // Server-driven mode (`persistence: true`): no local snapshot store; on mount
  // the client hydrates the last generation for `threadId` from the server.
  private readonly serverDriven: boolean = false
  private body: Record<string, any>

  private result: TOutput | null = null
  private input: VideoGenerateInput | null = null
  private progress: AIDevtoolsGenerationProgress | null = null
  private jobId: string | null = null
  private videoStatus: VideoStatusInfo | null = null
  private isLoading = false
  private error: Error | undefined = undefined
  private status: GenerationClientState = 'idle'
  private resumeSnapshot: GenerationResumeSnapshot | undefined
  private abortController: AbortController | null = null
  private rejoinedRunId: string | undefined
  private readonly callbacksRef: VideoCallbacks<TOutput>
  private devtoolsMounted = false
  private disposed = false
  private serverHydrationStarted = false

  constructor(
    options: Omit<
      VideoGenerationClientOptions<TOutput>,
      'persistence' | 'threadId'
    > &
      GenerationPersistenceOptions &
      GenerationTransport<VideoGenerateInput, VideoGenerateResult>,
  ) {
    // `threadId` is the only identity. Do not mint a random id during
    // construct: hooks build this client during render.
    this.threadId = options.threadId ?? ''
    this.uniqueId = this.threadId
    this.connection = options.connection
    this.fetcher = options.fetcher
    this.hydrateGenerationHandler = options.hydrateGeneration
    this.joinRunHandler = options.joinRun
    this.body = options.body ?? {}
    // `persistence` is `false`/omitted (ephemeral) or `true` (server-driven:
    // hydrate the last generation for `threadId` from the server on mount).
    this.serverDriven = options.persistence === true
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
      onResumeSnapshotChange: options.onResumeSnapshotChange,
      onResumeStateChange: options.onResumeStateChange,
    }

    this.devtoolsMetadata = this.createDevtoolsMetadata(options.devtools)
    this.devtoolsBridge = (
      options.devtoolsBridgeFactory ?? createNoOpVideoDevtoolsBridge
    )<TOutput>(this.buildDevtoolsBridgeOptions())

    // Mount hydration (`maybeHydrateFromServer`) is deliberately NOT run here. The framework
    // hooks build this client inside `useMemo`, so the constructor executes in
    // React's render phase; hydrating here would re-fire the hydrate GET on
    // every discarded/speculative render, flooding the connection pool when
    // several clients mount together. It is kicked off once from
    // `mountDevtools`, which the hooks call from a commit-phase mount effect.
  }

  private buildDevtoolsBridgeOptions(): VideoDevtoolsBridgeOptions<TOutput> {
    const client = this
    return {
      get hookId() {
        return client.uniqueId
      },
      get clientId() {
        return client.uniqueId
      },
      get threadId() {
        return client.threadId
      },
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
    this.ensureThreadId()
    // Mounting revives a disposed client. Framework hooks call this from
    // their mount effect, so a dispose → remount cycle (e.g. React
    // StrictMode's mount → cleanup → mount replay against the same memoized
    // client) leaves the client usable again.
    this.disposed = false
    this.maybeHydrateFromServer()
    // Re-attach to an already-loaded `running` snapshot (remount case); see the
    // note in GenerationClient.mountDevtools. Guarded by rejoinInFlight.
    this.maybeResumeInFlight()
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
    if (this.disposed) return
    if (this.isLoading) return
    this.mountDevtools()

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
        await this.processStream(stream, runId, signal)
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
      this.recordResumeSnapshotError(error)
      this.devtoolsBridge.finishRun(
        this.devtoolsBridge.getActiveRunId() ?? runId,
        'run:errored',
        'errored',
        error.message,
      )
      this.callbacksRef.onError?.(error)
    } finally {
      if (this.abortController === abortController) {
        this.abortController = null
        this.setIsLoading(false)
      }
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
      await this.processStream(parseSSEResponse(result, signal), runId, signal)
    } else {
      this.devtoolsBridge.ensureRunStarted(runId)
      this.setResult(result)
      this.setStatus('success')
      this.completePlainFetcherResumeSnapshot(result)
    }
  }

  /**
   * Process a stream of AG-UI events from the streaming connection adapter.
   * The server handles the polling loop and streams status updates.
   *
   * Throws {@link GENERATION_STREAM_TRUNCATED_MESSAGE} when the iteration ends
   * without a terminal chunk — see the note on
   * `GenerationClient.processStream`. Video runs are long enough that a proxy
   * idle timeout mid-poll is the likeliest way to hit it.
   */
  private async processStream(
    source: AsyncIterable<StreamChunk>,
    fallbackRunId: string,
    signal: AbortSignal,
  ): Promise<void> {
    let streamRunId: string | undefined
    let sawTerminalChunk = false

    for await (const chunk of source) {
      if (signal.aborted) break

      this.callbacksRef.onChunk?.(chunk)
      this.observeResumeSnapshot(chunk)
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
          sawTerminalChunk = true
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
            (chunk.message as string | undefined) || 'An error occurred'
          throw new Error(msg)
        }
        default:
          break
      }
    }

    // An aborted read is a deliberate stop/dispose, not a truncation.
    if (!sawTerminalChunk && !signal.aborted) {
      throw new Error(GENERATION_STREAM_TRUNCATED_MESSAGE)
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
    // A stopped run is no longer resumable. Without this the in-memory
    // snapshot stays `running`, and a remount's `maybeResumeInFlight` would
    // rejoin a run the user just cancelled.
    if (this.resumeSnapshot && this.resumeSnapshot.status === 'running') {
      this.resumeSnapshot = {
        ...this.resumeSnapshot,
        resumeState: null,
        status: 'idle',
      }
      this.notifyResumeSnapshotChanged()
    }
  }

  /**
   * Clear all state and return to idle. Also drops the client's in-memory
   * resume snapshot, so a remount restores nothing. The server-side record is
   * untouched — this client no longer writes one — so a full page reload under
   * `persistence: true` re-hydrates the last generation again.
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
    this.clearResumeSnapshot()
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
    this.disposed = true
    // Teardown, NOT a user cancel (see GenerationClient.dispose): abort in-flight
    // delivery but keep the `running` snapshot resumable so a remount rejoins.
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.setIsLoading(false)
    this.devtoolsBridge.dispose()
    this.devtoolsMounted = false
    this.serverHydrationStarted = false
    this.rejoinedRunId = undefined
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

  getResumeSnapshot(): GenerationResumeSnapshot | undefined {
    return this.resumeSnapshot
      ? {
          ...this.resumeSnapshot,
          ...(this.resumeSnapshot.pendingArtifacts
            ? { pendingArtifacts: [...this.resumeSnapshot.pendingArtifacts] }
            : {}),
          ...(this.resumeSnapshot.result
            ? {
                result: {
                  ...this.resumeSnapshot.result,
                  ...(this.resumeSnapshot.result.artifacts
                    ? { artifacts: [...this.resumeSnapshot.result.artifacts] }
                    : {}),
                },
              }
            : {}),
          ...(this.resumeSnapshot.error
            ? { error: { ...this.resumeSnapshot.error } }
            : {}),
          ...(this.resumeSnapshot.lastEvent
            ? { lastEvent: { ...this.resumeSnapshot.lastEvent } }
            : {}),
        }
      : undefined
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
    // oxlint-disable-next-line eslint-js/no-restricted-syntax -- TOutput defaults to VideoGenerateResult when no onResult transform is supplied
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

  private ensureThreadId(): string {
    if (!this.threadId) {
      this.threadId = this.generateUniqueId('video')
    }
    this.uniqueId = this.threadId
    return this.threadId
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

  private observeResumeSnapshot(chunk: StreamChunk): void {
    this.resumeSnapshot = updateGenerationResumeSnapshot(
      this.resumeSnapshot,
      chunk,
    )
    this.notifyResumeSnapshotChanged()
  }

  /** Notify the internal snapshot listener AND emit the public resume state. */
  private notifyResumeSnapshotChanged(): void {
    this.callbacksRef.onResumeSnapshotChange?.(this.resumeSnapshot)
    this.emitResumeState()
  }

  /** Derive the public `resumeState` from the internal snapshot. */
  private emitResumeState(): void {
    const snapshot = this.resumeSnapshot
    const state = snapshot?.resumeState
    const resumeState: GenerationResumeState | null = state
      ? {
          ...state,
          ...(snapshot?.pendingArtifacts && snapshot.pendingArtifacts.length > 0
            ? { pendingArtifacts: [...snapshot.pendingArtifacts] }
            : {}),
        }
      : null
    this.callbacksRef.onResumeStateChange?.(resumeState)
  }

  /**
   * Repaint the normal fields from a restored snapshot so a reload presents the
   * video in `result` / `status` / `error` / `jobId`, never a snapshot object.
   * `isLoading` stays false (no auto-tail). Not re-persisted (it came from
   * storage / the server).
   *
   * A `complete` snapshot with no durable video artifact cannot be rebuilt, so
   * it repaints as an error rather than a `success` with a `null` result — see
   * the note on `GenerationClient.repaintFromSnapshot`.
   */
  private repaintFromSnapshot(snapshot: GenerationResumeSnapshot): void {
    this.resumeSnapshot = snapshot
    this.notifyResumeSnapshotChanged()
    this.setStatus(clientStateFromResumeStatus(snapshot.status))
    this.setError(
      snapshot.error
        ? Object.assign(
            new Error(snapshot.error.message),
            snapshot.error.code ? { code: snapshot.error.code } : {},
          )
        : undefined,
    )
    if (snapshot.result?.providerJobId)
      this.setJobId(snapshot.result.providerJobId)
    const restored = this.reconstructVideoResult(snapshot)
    if (restored !== null) {
      this.setResult(restored)
    } else if (snapshot.status === 'complete') {
      this.reportUnrestorableResult()
    }
  }

  /**
   * Report a `complete` snapshot with no durable video artifact to rebuild
   * from. Runs after the status/error repaint above, so it wins over the
   * snapshot's own `complete` status.
   */
  private reportUnrestorableResult(): void {
    const error = new Error(GENERATION_UNRESTORABLE_RESULT_MESSAGE)
    this.setStatus('error')
    this.setError(error)
    this.callbacksRef.onError?.(error)
  }

  /**
   * Repaint a restored snapshot (client store or server hydrate) and, when it
   * reports a run still in flight, tail that run to completion via `joinRun`
   * (from the connection, or the `joinRun` option when the transport can't
   * carry one).
   *
   * A `running` snapshot that no `joinRun` handler can tail is repainted as an
   * interrupted error instead of a `generating` status that would never
   * settle: an interrupted generation cannot be resumed, only re-run.
   */
  private repaintRestoredSnapshot(
    snapshot: GenerationResumeSnapshot,
    activeRunId?: string,
  ): void {
    if (snapshot.status !== 'running') {
      this.repaintFromSnapshot(snapshot)
      return
    }
    const joinRun = this.connection?.joinRun ?? this.joinRunHandler
    const runId = activeRunId ?? snapshot.resumeState?.runId
    if (runId && joinRun) {
      this.repaintFromSnapshot(snapshot)
      this.rejoinInFlight(runId)
      return
    }
    this.repaintFromSnapshot({
      ...snapshot,
      resumeState: null,
      status: 'error',
      error: {
        message:
          'The previous generation was interrupted before it finished and cannot be resumed — generate again to retry.',
      },
    })
  }

  /**
   * Rebuild a `VideoGenerateResult` from a restored snapshot: the video's bytes
   * are served from the durable artifact URL, so the restored result renders
   * from your own origin. Returns `null` when there is no durable video artifact.
   */
  private reconstructVideoResult(
    snapshot: GenerationResumeSnapshot,
  ): VideoGenerateResult | null {
    const result = snapshot.result
    const artifacts = result?.artifacts ?? []
    const output = artifacts.find(
      (a) =>
        a.role === 'output' && a.source.mediaType === 'video' && a.url != null,
    )
    if (!output?.url) return null
    return {
      jobId: result?.providerJobId ?? '',
      status: 'completed',
      url: output.url,
      ...(result?.expiresAt ? { expiresAt: new Date(result.expiresAt) } : {}),
      artifacts,
    }
  }

  /**
   * The plain (non-Response) fetcher path never observes stream chunks, so
   * the terminal snapshot is built here from the fetcher's own result. A
   * stale `error` from a previous run is intentionally dropped — this run
   * succeeded.
   */
  private completePlainFetcherResumeSnapshot(rawResult: unknown): void {
    const previous = this.resumeSnapshot
    const result = createGenerationResultSnapshot(rawResult)
    this.resumeSnapshot = {
      schemaVersion: 1,
      resumeState: null,
      status: 'complete',
      ...(previous?.activity ? { activity: previous.activity } : {}),
      ...(previous?.pendingArtifacts && previous.pendingArtifacts.length > 0
        ? { pendingArtifacts: [...previous.pendingArtifacts] }
        : {}),
      ...(result
        ? { result }
        : previous?.result
          ? { result: { ...previous.result } }
          : {}),
    }
    this.notifyResumeSnapshotChanged()
  }

  /**
   * Records a transport-level failure (network drop, throwing callback) in
   * the snapshot. Without this, only a server-emitted RUN_ERROR chunk would
   * mark the snapshot `error`, leaving a persisted record that claims the
   * run is still in flight.
   */
  private recordResumeSnapshotError(error: Error): void {
    // Surface the failure on the observable fields FIRST, unconditionally (see
    // the note in GenerationClient.recordResumeSnapshotError): a RUN_ERROR
    // already flipped the snapshot to `error`, so the early-return would else
    // skip this and leave `status` stuck on `generating`. The guard avoids a
    // duplicate `error` emission on the live `generate()` path.
    if (this.status !== 'error') this.setStatus('error')
    this.setError(error)
    if (this.resumeSnapshot?.status === 'error') return
    if (!this.resumeSnapshot && !this.serverDriven) return
    const previous = this.resumeSnapshot
    this.resumeSnapshot = {
      schemaVersion: 1,
      resumeState: null,
      status: 'error',
      ...(previous?.activity ? { activity: previous.activity } : {}),
      ...(previous?.pendingArtifacts && previous.pendingArtifacts.length > 0
        ? { pendingArtifacts: [...previous.pendingArtifacts] }
        : {}),
      ...(previous?.result ? { result: { ...previous.result } } : {}),
      error: { message: error.message },
    }
    this.notifyResumeSnapshotChanged()
  }

  /**
   * Drop the client's in-memory snapshot and re-emit. Purely local — this
   * client writes no storage, so nothing persisted is removed.
   */
  private clearResumeSnapshot(): void {
    this.resumeSnapshot = undefined
    this.notifyResumeSnapshotChanged()
  }

  /**
   * Server-driven mount hydration entry point (`persistence: true`). Runs at
   * most once, from the commit-phase mount path (`mountDevtools`) — never the
   * constructor / render phase — so remounts and speculative renders can't
   * re-fire the hydrate GET.
   */
  private maybeHydrateFromServer(): void {
    if (!this.serverDriven || this.serverHydrationStarted) return
    this.serverHydrationStarted = true
    if (this.connection?.hydrateGeneration ?? this.hydrateGenerationHandler) {
      this.hydrateFromServer()
    } else {
      // `persistence: true` without any hydrate source can never restore
      // anything — warn rather than silently no-op.
      console.warn(
        '[TanStack AI] `persistence: true` (server-driven) needs a `hydrateGeneration` handler — either a connection that implements one (e.g. `fetchServerSentEvents` / `fetchHttpStream`, or `stream()` / `rpcStream()` with persistence handlers) or the `hydrateGeneration` option. Without one, nothing is persisted or restored.',
      )
    }
  }

  /**
   * Server-driven mount hydration (`persistence: true`). The client holds no
   * local snapshot; on mount it asks the server — keyed by the stable threadId —
   * for the last generation's resume snapshot, validates it, and repaints it. It
   * never auto-starts a run, and never blocks: a `generate()` that starts first
   * owns the client and hydration backs off, mirroring the chat client.
   *
   * A genuine **miss** (no record for the thread) is silent; a genuine
   * **failure** (transport error, authorize rejection, malformed body, a record
   * the validator rejects) surfaces through `status` / `error` / `onError` — see
   * the note on `GenerationClient.hydrateFromServer`.
   */
  private hydrateFromServer(): void {
    const hydrate =
      this.connection?.hydrateGeneration ?? this.hydrateGenerationHandler
    if (!hydrate) return
    // A send that already started owns the client; don't stomp it.
    if (this.resumeSnapshot || this.isLoading || this.status !== 'idle') return
    void (async () => {
      let res: GenerationHydrationResult
      try {
        res = await hydrate(this.threadId)
      } catch (cause) {
        this.failHydration(
          createGenerationHydrationError(
            'the request to the server did not succeed',
            cause,
          ),
        )
        return
      }
      // No record for this thread — a fresh thread, not a failure.
      if (!res.resumeSnapshot) return
      const snapshot = parseGenerationResumeSnapshot(res.resumeSnapshot)
      if (!snapshot) {
        this.failHydration(
          createGenerationHydrationError(
            'the server returned a record this client cannot read (unknown schema version, or a missing/invalid `status` or `resumeState`)',
          ),
        )
        return
      }
      // Re-check: a send may have started while the fetch was in flight.
      if (this.resumeSnapshot || this.isLoading || this.status !== 'idle')
        return
      // A run still generating on the server: re-attach and finish it in place.
      this.repaintRestoredSnapshot(snapshot, res.activeRun?.runId)
    })()
  }

  /**
   * Surface a hydration failure on the observable fields. Skipped when a
   * `generate()` took ownership while the hydrate GET was in flight.
   */
  private failHydration(error: Error): void {
    if (this.resumeSnapshot || this.isLoading || this.status !== 'idle') return
    this.setStatus('error')
    this.setError(error)
    this.callbacksRef.onError?.(error)
  }

  /**
   * Re-attach to an already-loaded `running` snapshot (remount case); see the
   * note in GenerationClient.maybeResumeInFlight. Guarded by `rejoinInFlight`.
   */
  private maybeResumeInFlight(): void {
    if (this.resumeSnapshot?.status !== 'running') return
    const runId = this.resumeSnapshot.resumeState?.runId
    if (runId) this.rejoinInFlight(runId)
  }

  /**
   * Re-attach to a video run still generating and stream it to completion,
   * mirroring the chat client's mount-time rejoin. Reuses `processStream`, so
   * the job status and result repaint from the replayed chunks. A live
   * `generate()` owns the client and is never stomped; a run is rejoined once.
   */
  private rejoinInFlight(runId: string): void {
    const joinRun = this.connection?.joinRun ?? this.joinRunHandler
    if (!joinRun) return
    if (this.rejoinedRunId === runId) return
    if (this.isLoading || this.abortController) return
    this.rejoinedRunId = runId
    const controller = new AbortController()
    this.abortController = controller
    this.setIsLoading(true)
    this.setStatus('generating')
    void (async () => {
      try {
        await this.processStream(
          joinRun(runId, controller.signal),
          runId,
          controller.signal,
        )
      } catch (error) {
        if (!controller.signal.aborted) {
          const failure =
            error instanceof Error ? error : new Error(String(error))
          // Settles `status`/`error` AND rewrites the snapshot to a terminal
          // `error` with a null `resumeState`, so the next mount does not
          // rejoin this run again.
          this.recordResumeSnapshotError(failure)
          this.callbacksRef.onError?.(failure)
        }
      } finally {
        // Only reset if this rejoin still owns the client: a `stop()` +
        // fresh `generate()` may have replaced the controller while the tail
        // was settling, and that live run owns `isLoading` now.
        if (this.abortController === controller) {
          this.abortController = null
          this.setIsLoading(false)
        }
      }
    })()
  }
}
