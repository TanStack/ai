import { GENERATION_EVENTS } from './generation-types'
import {
  ClientDevtoolsBridge,
  createAIDevtoolsGenerationPreview,
} from './devtools'
import { parseSSEResponse } from './sse-parser'
import type { StreamChunk } from '@tanstack/ai'
import type {
  ConnectConnectionAdapter,
  RunAgentInputContext,
} from './connection-adapters'
import type {
  AIDevtoolsClientMetadata,
  AIDevtoolsGenerationPreview,
  AIDevtoolsGenerationProgress,
  AIDevtoolsGenerationRunSnapshot,
} from './devtools'
import type {
  GenerationClientOptions,
  GenerationClientState,
  GenerationFetcher,
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
}

interface AIDevtoolsGenerationSnapshot<TOutput> extends Record<
  string,
  unknown
> {
  input: unknown | null
  result: TOutput | null
  preview: AIDevtoolsGenerationPreview
  progress: AIDevtoolsGenerationProgress | null
  status: GenerationClientState
  isLoading: boolean
  activeRunId: string | null
  runs: Array<AIDevtoolsGenerationRunSnapshot<TOutput>>
  error?: string
}

interface GenerationRunPatch<TOutput> {
  input?: unknown | null
  result?: TOutput | null
  preview?: AIDevtoolsGenerationPreview
  progress?: AIDevtoolsGenerationProgress | null
  status?: string
  isLoading?: boolean
  completedAt?: number
  error?: string
  clearError?: boolean
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
  private readonly devtoolsBridge: ClientDevtoolsBridge<
    AIDevtoolsGenerationSnapshot<TOutput>
  >
  private readonly threadId: string
  private body: Record<string, any>
  private result: TOutput | null = null
  private input: TInput | null = null
  private progress: AIDevtoolsGenerationProgress | null = null
  private isLoading = false
  private error: Error | undefined = undefined
  private status: GenerationClientState = 'idle'
  private activeRunId: string | null = null
  private activeRunStarted = false
  private devtoolsRuns: Array<AIDevtoolsGenerationRunSnapshot<TOutput>> = []
  private readonly maxDevtoolsRuns = 20
  private abortController: AbortController | null = null
  private readonly callbacksRef: GenerationCallbacks<TResult, TOutput>
  private devtoolsMounted = false

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

    this.callbacksRef = {
      onResult: options.onResult,
      onError: options.onError,
      onProgress: options.onProgress,
      onChunk: options.onChunk,
      onResultChange: options.onResultChange,
      onLoadingChange: options.onLoadingChange,
      onErrorChange: options.onErrorChange,
      onStatusChange: options.onStatusChange,
    }

    this.devtoolsMetadata = this.createDevtoolsMetadata(options.devtools)
    this.devtoolsBridge = new ClientDevtoolsBridge({
      hookId: this.uniqueId,
      clientId: this.uniqueId,
      threadId: this.threadId,
      metadata: this.devtoolsMetadata,
      getSnapshot: () => this.getDevtoolsSnapshot(),
    })
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
    if (this.isLoading) return

    this.input = input
    this.progress = null
    const runId = this.beginDevtoolsRun(input)
    this.setIsLoading(true)
    this.setStatus('generating')
    this.setError(undefined)

    const abortController = new AbortController()
    this.abortController = abortController
    const { signal } = abortController

    try {
      if (this.fetcher) {
        // Direct fetch path
        const result = await this.fetcher(input, { signal })
        if (signal.aborted) return
        if (result instanceof Response) {
          // Server function returned SSE Response — parse stream
          await this.processStream(parseSSEResponse(result, signal), runId)
        } else {
          this.ensureDevtoolsRunStarted(runId)
          this.setResult(result)
          this.setStatus('success')
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
        await this.processStream(stream, runId)
      } else {
        throw new Error(
          'GenerationClient requires either a connection or fetcher option',
        )
      }
      if (!signal.aborted && this.status === 'success') {
        this.finishDevtoolsRun(
          this.activeRunId ?? runId,
          'run:completed',
          'completed',
        )
      }
    } catch (err: unknown) {
      if (signal.aborted) return
      const error = err instanceof Error ? err : new Error(String(err))
      this.setError(error)
      this.setStatus('error')
      this.finishDevtoolsRun(
        this.activeRunId ?? runId,
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
   * Process a stream of AG-UI events from the streaming connection adapter.
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

      // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- AG-UI EventType has ~22 variants; this consumer only handles the subset relevant to generation lifecycle.
      switch (chunk.type) {
        case 'RUN_STARTED': {
          streamRunId = chunk.runId
          this.ensureDevtoolsRunStarted(chunk.runId)
          break
        }
        case 'CUSTOM': {
          this.ensureDevtoolsRunStarted(streamRunId ?? fallbackRunId)
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
          this.ensureDevtoolsRunStarted(chunk.runId)
          this.setStatus('success')
          break
        }
        case 'RUN_ERROR': {
          this.ensureDevtoolsRunStarted(
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
    const runId = this.activeRunId
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.setIsLoading(false)
    if (this.status === 'generating') {
      this.setStatus('idle')
      if (runId) {
        this.finishDevtoolsRun(runId, 'run:cancelled', 'cancelled')
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
    this.setError(undefined)
    this.setStatus('idle')
  }

  /**
   * Update options without recreating the client.
   */
  updateOptions(
    options: Partial<
      Pick<
        GenerationClientOptions<TInput, TResult, TOutput>,
        'body' | 'onResult' | 'onError' | 'onProgress' | 'onChunk'
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

  private setResult(rawResult: TResult | null): void {
    if (rawResult === null) {
      this.result = null
      this.updateActiveDevtoolsRun({
        result: null,
        preview: this.createDevtoolsPreview(null),
      })
      this.callbacksRef.onResultChange?.(null)
      this.emitDevtoolsState()
      return
    }

    if (this.callbacksRef.onResult) {
      const transformed = this.callbacksRef.onResult(rawResult)
      if (transformed === null) {
        this.emitDevtoolsState()
        // null return → keep previous result unchanged
        return
      }
      if (transformed !== undefined) {
        // Non-null, non-undefined → use transformed value
        this.result = transformed
        this.updateActiveDevtoolsRun({
          result: this.result,
          preview: this.createDevtoolsPreview(this.result),
          clearError: true,
        })
        this.callbacksRef.onResultChange?.(this.result)
        this.emitDevtoolsState()
        return
      }
    }

    // No onResult callback, or callback returned void → use raw value
    this.result = rawResult as TOutput
    this.updateActiveDevtoolsRun({
      result: this.result,
      preview: this.createDevtoolsPreview(this.result),
      clearError: true,
    })
    this.callbacksRef.onResultChange?.(this.result)
    this.emitDevtoolsState()
  }

  private setIsLoading(isLoading: boolean): void {
    this.isLoading = isLoading
    this.updateActiveDevtoolsRun({ isLoading })
    this.callbacksRef.onLoadingChange?.(isLoading)
    this.emitDevtoolsState()
  }

  private setError(error: Error | undefined): void {
    this.error = error
    this.updateActiveDevtoolsRun(
      error ? { error: error.message } : { clearError: true },
    )
    this.callbacksRef.onErrorChange?.(error)
    this.emitDevtoolsState()
  }

  private setStatus(status: GenerationClientState): void {
    this.status = status
    this.updateActiveDevtoolsRun({ status })
    this.callbacksRef.onStatusChange?.(status)
    this.emitDevtoolsState()
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
    this.updateActiveDevtoolsRun({ progress: this.progress })
    this.emitDevtoolsState()
  }

  private beginDevtoolsRun(input: TInput): string {
    const runId = this.generateUniqueId('run')
    this.activeRunId = runId
    this.activeRunStarted = false
    this.upsertDevtoolsRun(runId, {
      input,
      result: null,
      preview: this.createDevtoolsPreview(null),
      progress: null,
      status: 'generating',
      isLoading: true,
      clearError: true,
    })
    return runId
  }

  private ensureDevtoolsRunStarted(runId: string): void {
    if (this.activeRunStarted && this.activeRunId === runId) {
      return
    }

    if (
      !this.activeRunStarted &&
      this.activeRunId &&
      this.activeRunId !== runId
    ) {
      this.renameDevtoolsRun(this.activeRunId, runId)
    }

    this.activeRunId = runId
    this.activeRunStarted = true
    this.upsertDevtoolsRun(runId, {
      status: 'generating',
      isLoading: true,
      clearError: true,
    })
    this.devtoolsBridge.emitRunLifecycle('run:started', runId, 'started')
    this.emitDevtoolsState()
  }

  private finishDevtoolsRun(
    runId: string,
    eventType: 'run:completed' | 'run:errored' | 'run:cancelled',
    status: 'completed' | 'errored' | 'cancelled',
    error?: string,
  ): void {
    this.ensureDevtoolsRunStarted(runId)
    const completedAt = Date.now()
    const completedProgress =
      status === 'completed' ? this.completeDevtoolsProgress() : this.progress
    const runStatus =
      status === 'completed'
        ? 'success'
        : status === 'errored'
          ? 'error'
          : 'cancelled'

    this.upsertDevtoolsRun(runId, {
      status: runStatus,
      isLoading: false,
      progress: completedProgress,
      completedAt,
      ...(error ? { error } : { clearError: true }),
    })

    if (this.activeRunId === runId) {
      this.activeRunId = null
    }
    this.activeRunStarted = false
    this.devtoolsBridge.emitRunLifecycle(eventType, runId, status, {
      ...(error ? { error } : {}),
    })
    this.emitDevtoolsState()
  }

  private getDevtoolsSnapshot(): AIDevtoolsGenerationSnapshot<TOutput> {
    return {
      input: this.input,
      result: this.result,
      preview: this.createDevtoolsPreview(this.result),
      progress: this.progress,
      status: this.status,
      isLoading: this.isLoading,
      activeRunId: this.activeRunId,
      runs: this.devtoolsRuns,
      ...(this.error ? { error: this.error.message } : {}),
    }
  }

  private updateActiveDevtoolsRun(patch: GenerationRunPatch<TOutput>): void {
    if (!this.activeRunId) return
    this.upsertDevtoolsRun(this.activeRunId, patch)
  }

  private upsertDevtoolsRun(
    runId: string,
    patch: GenerationRunPatch<TOutput>,
  ): void {
    const now = Date.now()
    const index = this.devtoolsRuns.findIndex((run) => run.id === runId)
    const existing = index >= 0 ? this.devtoolsRuns[index] : undefined
    const next: AIDevtoolsGenerationRunSnapshot<TOutput> = existing
      ? { ...existing }
      : {
          id: runId,
          input: this.input,
          result: null,
          preview: this.createDevtoolsPreview(null),
          progress: null,
          status: 'idle',
          isLoading: false,
          startedAt: now,
          updatedAt: now,
        }

    if ('input' in patch) {
      next.input = patch.input ?? null
    }
    if ('result' in patch) {
      next.result = patch.result ?? null
    }
    if (patch.preview) {
      next.preview = patch.preview
    }
    if ('progress' in patch) {
      next.progress = patch.progress ?? null
    }
    if (patch.status) {
      next.status = patch.status
    }
    if ('isLoading' in patch) {
      next.isLoading = patch.isLoading === true
    }
    if (patch.completedAt !== undefined) {
      next.completedAt = patch.completedAt
    }
    if (patch.clearError) {
      delete next.error
    }
    if (patch.error !== undefined) {
      next.error = patch.error
    }
    next.updatedAt = now

    if (index >= 0) {
      this.devtoolsRuns = this.devtoolsRuns.map((run) =>
        run.id === runId ? next : run,
      )
    } else {
      this.devtoolsRuns = [...this.devtoolsRuns, next]
    }

    if (this.devtoolsRuns.length > this.maxDevtoolsRuns) {
      this.devtoolsRuns = this.devtoolsRuns.slice(-this.maxDevtoolsRuns)
    }
  }

  private renameDevtoolsRun(previousRunId: string, nextRunId: string): void {
    if (previousRunId === nextRunId) return

    const existing = this.devtoolsRuns.find((run) => run.id === previousRunId)
    if (!existing) return

    const renamed = {
      ...existing,
      id: nextRunId,
      updatedAt: Date.now(),
    }
    this.devtoolsRuns = this.devtoolsRuns
      .filter((run) => run.id !== nextRunId)
      .map((run) => (run.id === previousRunId ? renamed : run))
  }

  private completeDevtoolsProgress(): AIDevtoolsGenerationProgress | null {
    if (!this.progress) return null

    this.progress = {
      value: 100,
      ...(this.progress.message ? { message: this.progress.message } : {}),
    }
    return this.progress
  }

  private createDevtoolsPreview(
    result: TOutput | null,
  ): AIDevtoolsGenerationPreview {
    return createAIDevtoolsGenerationPreview({
      outputKind: this.devtoolsMetadata.outputKind,
      result,
    })
  }

  private emitDevtoolsState(): void {
    this.devtoolsBridge.emitUpdated()
    this.devtoolsBridge.emitSnapshot()
  }

  private createDevtoolsMetadata(
    metadata?: Partial<AIDevtoolsClientMetadata>,
  ): AIDevtoolsClientMetadata {
    return {
      hookName: metadata?.hookName ?? 'useGeneration',
      ...(metadata?.framework ? { framework: metadata.framework } : {}),
      ...(metadata?.outputKind ? { outputKind: metadata.outputKind } : {}),
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
