import {
  GENERATION_EVENTS,
  updateGenerationResumeSnapshot,
} from './generation-types'
import { createNoOpGenerationDevtoolsBridge } from './devtools-noop'
import { parseSSEResponse } from './sse-parser'
import type { StreamChunk } from '@tanstack/ai/client'
import type {
  ConnectConnectionAdapter,
  RunAgentInputContext,
} from './connection-adapters'
import type {
  AIDevtoolsClientMetadata,
  AIDevtoolsGenerationProgress,
  GenerationDevtoolsBridge,
  GenerationDevtoolsBridgeOptions,
} from './devtools'
import type {
  GenerationClientOptions,
  GenerationClientState,
  GenerationFetcher,
  GenerationResumeSnapshot,
  GenerationResumeState,
  GenerationServerPersistence,
} from './generation-types'

/**
 * Callbacks stored in a ref so hooks can update them without recreating the client.
 */
// All optional fields explicitly allow `| undefined` so callers can spread
// option bags (where each callback may be `undefined`) into the callbacks
// ref under `exactOptionalPropertyTypes`.
interface GenerationCallbacks<TResult, TOutput> {
  onResult?: ((result: TResult) => TOutput | null | void) | undefined
  onError?: ((error: Error) => void) | undefined
  onProgress?: ((progress: number, message?: string) => void) | undefined
  onChunk?: ((chunk: StreamChunk) => void) | undefined
  onResultChange?: ((result: TOutput | null) => void) | undefined
  onLoadingChange?: ((isLoading: boolean) => void) | undefined
  onErrorChange?: ((error: Error | undefined) => void) | undefined
  onStatusChange?: ((status: GenerationClientState) => void) | undefined
  onResumeSnapshotChange?:
    | ((snapshot: GenerationResumeSnapshot) => void)
    | undefined
}

/**
 * A lightweight, generic client for one-shot generation tasks
 * (image, speech, transcription, summarize).
 *
 * Supports two transport modes:
 * - **ConnectConnectionAdapter** — Streaming transport (SSE, HTTP stream, custom).
 *   Server wraps results in StreamChunk events with CUSTOM event names.
 * - **Fetcher** — Direct async function call. No streaming protocol needed.
 *
 * @template TInput - The input type for the generation request
 * @template TResult - The result type returned by the generation
 *
 * @example
 * ```typescript
 * // With streaming connection adapter
 * const client = new GenerationClient<ImageGenerateInput, ImageGenerationResult>({
 *   connection: fetchServerSentEvents('/api/generate/image'),
 *   onResultChange: setResult,
 *   onLoadingChange: setIsLoading,
 * })
 *
 * // With fetcher (direct)
 * const client = new GenerationClient<ImageGenerateInput, ImageGenerationResult>({
 *   fetcher: async (input) => {
 *     const res = await fetch('/api/generate/image', {
 *       method: 'POST',
 *       body: JSON.stringify(input),
 *     })
 *     return res.json()
 *   },
 * })
 *
 * await client.generate({ prompt: 'A sunset over mountains' })
 * ```
 */
export class GenerationClient<
  TInput extends Record<string, any>,
  TResult,
  TOutput = TResult,
> {
  private readonly connection: ConnectConnectionAdapter | undefined
  private readonly fetcher: GenerationFetcher<TInput, TResult> | undefined
  private readonly uniqueId: string
  private readonly devtoolsMetadata: AIDevtoolsClientMetadata
  private readonly devtoolsBridge: GenerationDevtoolsBridge<TOutput>
  private readonly threadId: string
  private readonly autoResume: boolean
  private readonly serverPersistence: GenerationServerPersistence | undefined
  private body: Record<string, any>
  private result: TOutput | null = null
  private input: TInput | null = null
  private progress: AIDevtoolsGenerationProgress | null = null
  private isLoading = false
  private error: Error | undefined = undefined
  private status: GenerationClientState = 'idle'
  private resumeSnapshot: GenerationResumeSnapshot | undefined
  private resumeState: GenerationResumeState | undefined
  private resumeSnapshotPersistenceQueue: Promise<void> = Promise.resolve()
  private resumeLifecycleToken = 0
  private resumePersistenceError: Error | undefined = undefined
  private abortController: AbortController | null = null
  private readonly callbacksRef: GenerationCallbacks<TResult, TOutput>
  private devtoolsMounted = false
  private disposed = false

  constructor(
    options: GenerationClientOptions<TInput, TResult, TOutput> &
      (
        | { connection: ConnectConnectionAdapter; fetcher?: never }
        | {
            fetcher: GenerationFetcher<TInput, TResult>
            connection?: never
          }
      ),
  ) {
    this.uniqueId = options.id ?? this.generateUniqueId('generation')
    this.threadId = this.uniqueId
    this.connection = options.connection
    this.fetcher = options.fetcher
    this.body = options.body ?? {}
    this.autoResume = options.autoResume ?? true
    this.serverPersistence = options.persistence?.server
    this.resumeSnapshot = options.initialResumeSnapshot
    this.resumeState =
      options.resumeState ??
      options.initialResumeSnapshot?.resumeState ??
      undefined

    this.callbacksRef = {
      onResult: options.onResult,
      onError: options.onError,
      onProgress: options.onProgress,
      onChunk: options.onChunk,
      onResultChange: options.onResultChange,
      onLoadingChange: options.onLoadingChange,
      onErrorChange: options.onErrorChange,
      onStatusChange: options.onStatusChange,
      onResumeSnapshotChange: options.onResumeSnapshotChange,
    }

    this.devtoolsMetadata = this.createDevtoolsMetadata(options.devtools)
    this.devtoolsBridge = (
      options.devtoolsBridgeFactory ?? createNoOpGenerationDevtoolsBridge
    )<TOutput>(this.buildDevtoolsBridgeOptions())
  }

  private buildDevtoolsBridgeOptions(): GenerationDevtoolsBridgeOptions<TOutput> {
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
   * Trigger a generation request.
   * Only one generation can be in-flight at a time; calling generate()
   * while already generating will be a no-op.
   */
  async generate(input: TInput): Promise<void> {
    this.mountDevtools()
    if (this.disposed) return
    if (this.isLoading) return

    this.input = input
    this.progress = null
    const runId = this.devtoolsBridge.beginRun(input)
    this.setIsLoading(true)
    this.setStatus('generating')
    this.setError(undefined)

    const abortController = new AbortController()
    this.abortController = abortController
    const { signal } = abortController

    try {
      if (this.fetcher) {
        // Direct fetch path
        const result = await this.fetcher(input, {
          signal,
          ...(this.resumeState ? { resumeState: this.resumeState } : {}),
        })
        if (signal.aborted) return
        if (result instanceof Response) {
          // Server function returned SSE Response — parse stream
          await this.processStream(
            parseSSEResponse(result, signal),
            runId,
            signal,
          )
        } else {
          this.devtoolsBridge.ensureRunStarted(runId)
          this.setResult(result)
          this.setStatus('success')
          this.completePlainFetcherResumeSnapshot()
        }
      } else if (this.connection) {
        // Streaming adapter path
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
          'GenerationClient requires either a connection or fetcher option',
        )
      }
      if (!signal.aborted && this.status === 'success') {
        // Bump progress to 100 on successful completion so devtools
        // snapshots reflect the final state. The bridge mirrors this in
        // the run's recorded progress, but the snapshot reads `progress`
        // from the client's core state.
        this.progress = completeProgressValue(this.progress)
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
      if (this.abortController === abortController) {
        this.abortController = null
        this.setIsLoading(false)
      }
    }
  }

  async resume(state?: GenerationResumeState): Promise<boolean> {
    const resumeToken = this.resumeLifecycleToken
    if (state) {
      this.resumeState = state
      this.resumeSnapshot = {
        ...(this.resumeSnapshot ?? { status: 'running' }),
        resumeState: state,
      }
      this.callbacksRef.onResumeSnapshotChange?.(this.resumeSnapshot)
    } else {
      await this.hydrateResumeSnapshot()
    }

    if (this.disposed || resumeToken !== this.resumeLifecycleToken) {
      return false
    }

    if (!this.resumeState) {
      return false
    }

    // Resume requests are identified by resumeState/runContext. They do not
    // need user media input and must not require callers to retain large input
    // payloads across a reload.
    await this.generate({} as TInput)
    return true
  }

  async maybeAutoResume(): Promise<boolean> {
    if (!this.autoResume || this.isLoading) {
      return false
    }
    return this.resume()
  }

  /**
   * Process a stream of AG-UI events from the streaming connection adapter.
   */
  private async processStream(
    source: AsyncIterable<StreamChunk>,
    fallbackRunId: string,
    signal: AbortSignal,
  ): Promise<void> {
    let streamRunId: string | undefined

    for await (const chunk of source) {
      if (signal.aborted) break

      this.callbacksRef.onChunk?.(chunk)
      this.observeResumeSnapshot(chunk)
      const chunkRunId =
        'runId' in chunk && typeof chunk.runId === 'string'
          ? chunk.runId
          : undefined

      // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- AG-UI EventType has ~22 variants; this consumer only handles the subset relevant to generation lifecycle.
      switch (chunk.type) {
        case 'RUN_STARTED': {
          streamRunId = chunk.runId
          this.devtoolsBridge.ensureRunStarted(chunk.runId)
          break
        }
        case 'CUSTOM': {
          this.devtoolsBridge.ensureRunStarted(streamRunId ?? fallbackRunId)
          if (chunk.name === GENERATION_EVENTS.RESULT) {
            this.setResult(chunk.value as TResult)
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
   * Abort any in-flight generation request.
   */
  stop(): void {
    this.resumeLifecycleToken++
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
   * Clear the result, error, and return to idle state.
   */
  reset(): void {
    this.stop()
    this.setResult(null)
    this.input = null
    this.progress = null
    this.devtoolsBridge.resetRuns()
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
        GenerationClientOptions<TInput, TResult, TOutput>,
        | 'body'
        | 'onResult'
        | 'onError'
        | 'onProgress'
        | 'onChunk'
        | 'resumeState'
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
    if (options.resumeState !== undefined) {
      this.resumeState = options.resumeState
    }
  }

  dispose(): void {
    this.disposed = true
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

  getIsLoading(): boolean {
    return this.isLoading
  }

  getError(): Error | undefined {
    return this.error
  }

  getResumePersistenceError(): Error | undefined {
    return this.resumePersistenceError
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

  private setResult(rawResult: TResult | null): void {
    if (rawResult === null) {
      this.result = null
      this.callbacksRef.onResultChange?.(null)
      this.devtoolsBridge.recordResultChange()
      return
    }

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
    // `TOutput` defaults to `TResult`, so the runtime cast is sound.
    // eslint-disable-next-line no-restricted-syntax -- TOutput defaults to TResult when no onResult transform is supplied
    this.result = rawResult as unknown as TOutput
    this.callbacksRef.onResultChange?.(this.result)
    this.devtoolsBridge.recordResultChange()
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

  private createDevtoolsMetadata(
    metadata?: Partial<AIDevtoolsClientMetadata>,
  ): AIDevtoolsClientMetadata {
    return {
      hookName: metadata?.hookName ?? 'useGeneration',
      ...(metadata?.framework ? { framework: metadata.framework } : {}),
      ...(metadata?.outputKind ? { outputKind: metadata.outputKind } : {}),
      ...(metadata?.name ? { name: metadata.name } : {}),
    }
  }

  private generateUniqueId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }

  private createRunContext(runId: string): RunAgentInputContext {
    if (this.resumeState) {
      return {
        threadId: this.resumeState.threadId,
        runId: this.resumeState.runId,
        cursor: this.resumeState.cursor,
      }
    }
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
    this.resumeState = this.resumeSnapshot.resumeState ?? undefined
    this.callbacksRef.onResumeSnapshotChange?.(this.resumeSnapshot)
    void this.persistResumeSnapshot(this.resumeSnapshot)
  }

  private completePlainFetcherResumeSnapshot(): void {
    if (!this.resumeState && !this.resumeSnapshot) {
      return
    }
    this.resumeState = undefined
    this.resumeSnapshot = {
      ...(this.resumeSnapshot ?? {}),
      resumeState: null,
      status: 'complete',
    }
    this.callbacksRef.onResumeSnapshotChange?.(this.resumeSnapshot)
    void this.persistResumeSnapshot(this.resumeSnapshot)
  }

  private async hydrateResumeSnapshot(): Promise<void> {
    if (this.resumeSnapshot || !this.serverPersistence) {
      return
    }
    const snapshot = await this.serverPersistence.getItem(this.threadId)
    if (!snapshot) {
      return
    }
    this.resumeSnapshot = snapshot
    this.resumeState = snapshot.resumeState ?? undefined
    this.callbacksRef.onResumeSnapshotChange?.(snapshot)
  }

  private async persistResumeSnapshot(
    snapshot: GenerationResumeSnapshot,
  ): Promise<void> {
    if (!this.serverPersistence) {
      return
    }

    this.resumeSnapshotPersistenceQueue =
      this.resumeSnapshotPersistenceQueue.then(
        () => this.writeResumeSnapshot(snapshot),
        () => this.writeResumeSnapshot(snapshot),
      )
    await this.resumeSnapshotPersistenceQueue
  }

  private async writeResumeSnapshot(
    snapshot: GenerationResumeSnapshot,
  ): Promise<void> {
    try {
      await this.serverPersistence?.setItem(this.threadId, snapshot)
    } catch (error) {
      this.resumePersistenceError =
        error instanceof Error ? error : new Error(String(error))
      console.warn(
        '[TanStack AI] Failed to persist generation resume snapshot',
        error,
      )
    }
  }
}

function completeProgressValue(
  progress: AIDevtoolsGenerationProgress | null,
): AIDevtoolsGenerationProgress | null {
  if (!progress) return null
  const message = progress.message
  return {
    value: 100,
    ...(message ? { message } : {}),
  }
}
