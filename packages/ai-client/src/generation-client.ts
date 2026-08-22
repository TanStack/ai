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
import { createNoOpGenerationDevtoolsBridge } from './devtools-noop'
import { parseSSEResponse } from './sse-parser'
import { restoreInboundChunk } from '@tanstack/ai/client'
import type { StreamChunk } from '@tanstack/ai/client'
import type {
  ConnectConnectionAdapter,
  GenerationHydrationResult,
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
  GenerationPersistenceOptions,
  GenerationRestoredResult,
  GenerationResumeSnapshot,
  GenerationResumeState,
  GenerationTransport,
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
    | ((snapshot: GenerationResumeSnapshot | undefined) => void)
    | undefined
  onResumeStateChange?:
    | ((resumeState: GenerationResumeState | null) => void)
    | undefined
  reconstructResult?:
    | ((restored: GenerationRestoredResult) => TResult | null)
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
  // Persistence handlers supplied as options (e.g. alongside a `fetcher`), used
  // when the connection doesn't carry its own — the connection's handlers take
  // precedence when both exist.
  private readonly hydrateGenerationHandler:
    | ConnectConnectionAdapter['hydrateGeneration']
    | undefined
  private readonly joinRunHandler:
    | ConnectConnectionAdapter['joinRun']
    | undefined
  private uniqueId: string
  private readonly devtoolsMetadata: AIDevtoolsClientMetadata
  private readonly devtoolsBridge: GenerationDevtoolsBridge<TOutput>
  private threadId: string
  private readonly persistenceScope: string | undefined
  // Server-driven mode (`persistence: true`): no local snapshot store; on mount
  // the client hydrates the last generation for `threadId` from the server.
  private readonly serverDriven: boolean = false
  private body: Record<string, any>
  private result: TOutput | null = null
  private input: TInput | null = null
  private progress: AIDevtoolsGenerationProgress | null = null
  private isLoading = false
  private error: Error | undefined = undefined
  private status: GenerationClientState = 'idle'
  private resumeSnapshot: GenerationResumeSnapshot | undefined
  private lastEmittedResumeState: string | undefined
  private abortController: AbortController | null = null
  private rejoinedRunId: string | undefined
  private readonly callbacksRef: GenerationCallbacks<TResult, TOutput>
  private devtoolsMounted = false
  private disposed = false
  private serverHydrationStarted = false

  constructor(
    options: Omit<
      GenerationClientOptions<TInput, TResult, TOutput>,
      'persistence' | 'threadId'
    > &
      GenerationPersistenceOptions &
      GenerationTransport<TInput, TResult>,
  ) {
    // `threadId` is the only identity. Do not mint a random id during
    // construct: hooks build this client during render.
    this.threadId = options.threadId ?? ''
    this.uniqueId = this.threadId
    // The persistence scope is the explicit `threadId` and nothing else.
    // The types require it whenever `persistence` is set. This field keeps a
    // generated wire id from becoming a storage key for JS callers.
    this.persistenceScope = options.threadId
    this.connection = options.connection
    this.fetcher = options.fetcher
    this.hydrateGenerationHandler = options.hydrateGeneration
    this.joinRunHandler = options.joinRun
    this.body = options.body ?? {}
    // `persistence` is `false`/omitted (ephemeral) or `true` (server-driven:
    // hydrate the last generation for `threadId` from the server on mount).
    this.serverDriven = options.persistence === true
    // The types require `threadId` alongside `persistence`, so this only fires
    // for JS callers. Warn rather than fall back silently: keying on the
    // generated wire id would write a different slot every reload, restoring
    // nothing while accumulating orphaned records.
    if (options.persistence && !this.persistenceScope) {
      console.warn(
        '[TanStack AI] `persistence` needs a stable `threadId` to key on. Without one nothing will be restored after a reload. Pass a `threadId` derived from your own domain (e.g. `product-123-hero`).',
      )
    }
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
      onResumeStateChange: options.onResumeStateChange,
      reconstructResult: options.reconstructResult,
    }

    this.devtoolsMetadata = this.createDevtoolsMetadata(options.devtools)
    this.devtoolsBridge = (
      options.devtoolsBridgeFactory ?? createNoOpGenerationDevtoolsBridge
    )<TOutput>(this.buildDevtoolsBridgeOptions())

    // Mount hydration (`maybeHydrateFromServer`) is deliberately NOT run here. The framework
    // hooks build this client inside `useMemo`, so the constructor executes in
    // React's render phase; hydrating here would re-fire the hydrate GET on
    // every discarded/speculative render, flooding the connection pool when
    // several clients mount together. It is kicked off once from
    // `mountDevtools`, which the hooks call from a commit-phase mount effect.
  }

  private buildDevtoolsBridgeOptions(): GenerationDevtoolsBridgeOptions<TOutput> {
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
    // Re-attach to an in-flight run whose snapshot is already loaded — the
    // remount case. On the FIRST mount the snapshot loads asynchronously and
    // `repaintRestoredSnapshot` starts the rejoin; on a StrictMode remount the
    // snapshot is already present but the prior rejoin was aborted by
    // `dispose()`, so retrigger it here. Guarded by `rejoinInFlight`'s own
    // dedupe/in-flight checks, so this never double-joins.
    this.maybeResumeInFlight()
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
    if (this.disposed) return
    if (this.isLoading) return
    this.mountDevtools()

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
        const result = await this.fetcher(input, { signal })
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
          this.completePlainFetcherResumeSnapshot(result)
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
   * Process a stream of AG-UI events from the streaming connection adapter.
   *
   * Throws {@link GENERATION_STREAM_TRUNCATED_MESSAGE} when the iteration ends
   * without a terminal chunk. A `for await` over a stream that simply stops —
   * proxy idle timeout, server restart, a durable log missing its terminal
   * append — returns normally and would otherwise leave the caller's `status`
   * on `generating` forever, with the persisted snapshot still `running` so
   * every reload rejoins the same dead run. Throwing routes it through the
   * caller's error path instead, which settles the status and rewrites the
   * snapshot so nothing chases it again.
   */
  private async processStream(
    source: AsyncIterable<StreamChunk>,
    fallbackRunId: string,
    signal: AbortSignal,
  ): Promise<void> {
    let streamRunId: string | undefined
    let sawTerminalChunk = false

    for await (const raw of source) {
      if (signal.aborted) break

      const chunk = restoreInboundChunk(raw)
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
          sawTerminalChunk = true
          this.devtoolsBridge.ensureRunStarted(chunk.runId)
          this.setStatus('success')
          break
        }
        case 'RUN_ERROR': {
          this.devtoolsBridge.ensureRunStarted(
            chunkRunId ?? streamRunId ?? fallbackRunId,
          )
          // Spec RUN_ERROR message. Missing message uses this fallback.
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
   * Abort any in-flight generation request.
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
   * Clear the result, error, and return to idle state. Also drops the client's
   * in-memory resume snapshot, so a remount restores nothing. The server-side
   * record is untouched — this client no longer writes one — so a full page
   * reload under `persistence: true` re-hydrates the last generation again.
   */
  reset(): void {
    this.stop()
    this.setResult(null)
    this.input = null
    this.progress = null
    this.devtoolsBridge.resetRuns()
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
    this.disposed = true
    // Teardown, NOT a user cancel: abort in-flight DELIVERY (this reader) but
    // do NOT call `stop()` — `stop()` marks the run non-resumable and wipes the
    // `running` snapshot, which is correct for a Stop button but wrong for an
    // unmount / React StrictMode dispose. Clearing it here would destroy the
    // in-memory resume state, so a remount of this same client instance could
    // never rejoin. (A real page revisit re-hydrates from the server instead.)
    // The run itself survives server-side (durable delivery), so the snapshot
    // must stay `running` for the remount to resume it.
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.setIsLoading(false)
    this.devtoolsBridge.dispose()
    this.devtoolsMounted = false
    // Re-arm mount hydration + rejoin so a remount resumes from the (preserved)
    // snapshot. `mountDevtools` re-runs the hydration entry point and
    // `maybeResumeInFlight`, both individually guarded.
    this.serverHydrationStarted = false
    this.rejoinedRunId = undefined
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
    // oxlint-disable-next-line eslint-js/no-restricted-syntax -- TOutput defaults to TResult when no onResult transform is supplied
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

  private ensureThreadId(): string {
    if (!this.threadId) {
      this.threadId = this.generateUniqueId('generation')
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

  /**
   * Notify the (internal) snapshot listener AND emit the public resume state.
   * The snapshot stays internal (persistence + devtools); the hook consumes
   * `resumeState`, mirroring the chat client.
   */
  private notifyResumeSnapshotChanged(): void {
    this.callbacksRef.onResumeSnapshotChange?.(this.resumeSnapshot)
    this.emitResumeState()
  }

  /**
   * Derive the public `resumeState` from the internal snapshot: the in-flight
   * run identity, with any in-flight artifact refs folded under it. `null` once
   * no run is in flight.
   *
   * The snapshot is rebuilt for every chunk, so emitting unconditionally would
   * hand each framework hook a fresh object per chunk and re-render the
   * component on every stream event. `resumeState` only changes at run
   * boundaries and when artifacts land, so skip the notification unless it
   * materially changed — same gate the persistence writes use.
   */
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
    const signature = JSON.stringify(resumeState)
    if (signature === this.lastEmittedResumeState) {
      return
    }
    this.lastEmittedResumeState = signature
    this.callbacksRef.onResumeStateChange?.(resumeState)
  }

  /**
   * Repaint the normal fields from a restored snapshot (client store or server
   * hydrate), so a reload presents the run in `result` / `status` / `error`
   * exactly as a just-finished run would, never a bolt-on snapshot object.
   * `isLoading` stays false: the client never auto-tails a restored run. The
   * snapshot is not re-persisted here (it came from storage / the server).
   *
   * When the activity's mapper DECLINES a `complete` snapshot the repaint
   * settles as an error instead: `success` with a `null` result is a state no
   * consumer can render, and it hides the real cause (an output artifact
   * persisted without a serve URL). A decline on any other status is expected —
   * a `running` snapshot has no result yet, the rejoin will deliver it.
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
    const restored = this.reconstructRestoredResult(snapshot)
    if (restored !== null) {
      this.setResult(restored)
    } else if (
      this.callbacksRef.reconstructResult &&
      snapshot.status === 'complete'
    ) {
      this.reportUnrestorableResult()
    }
  }

  /**
   * Report a `complete` snapshot the activity's mapper could not rebuild.
   * Runs after the status/error repaint above, so it wins over the snapshot's
   * own `complete` status.
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
   * Build the restorable result shape from the snapshot and hand it to the
   * per-activity `reconstructResult` mapper (injected by the specialized
   * client/hook, which knows the concrete result type).
   *
   * Returns `null` both when no mapper is set (nothing to rebuild — `result`
   * simply stays null) and when the mapper declines. The caller distinguishes
   * the two: see {@link repaintFromSnapshot}.
   */
  private reconstructRestoredResult(
    snapshot: GenerationResumeSnapshot,
  ): TResult | null {
    const build = this.callbacksRef.reconstructResult
    if (!build) return null
    const result = snapshot.result
    const restored: GenerationRestoredResult = {
      ...(result?.id !== undefined ? { id: result.id } : {}),
      ...(result?.model !== undefined ? { model: result.model } : {}),
      ...(result?.status !== undefined ? { status: result.status } : {}),
      ...(result?.providerJobId !== undefined
        ? { providerJobId: result.providerJobId }
        : {}),
      ...(result?.expiresAt !== undefined
        ? { expiresAt: result.expiresAt }
        : {}),
      ...(result?.text !== undefined ? { text: result.text } : {}),
      ...(result?.usage !== undefined ? { usage: result.usage } : {}),
      ...(snapshot.activity !== undefined
        ? { activity: snapshot.activity }
        : {}),
      artifacts: result?.artifacts ?? [],
    }
    return build(restored)
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
    // Surface the failure on the OBSERVABLE fields FIRST: a rejoin (or live
    // stream) that emits RUN_ERROR has already flipped the snapshot to `error`
    // via `observeResumeSnapshot`, so the early-return below would otherwise
    // skip this and leave `status` stuck on `generating` — the run would look
    // like it is still going forever. The guard avoids a duplicate `error`
    // emission on the live `generate()` path, which sets the status itself.
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
    this.lastEmittedResumeState = undefined
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
   * A genuine **miss** (the server reports no record for the thread) is silent —
   * a fresh thread is not an error. A genuine **failure** (transport error, a
   * 403 from the authorize gate, a malformed body, a record the client's own
   * validator rejects) is surfaced through `status` / `error` / `onError`, so a
   * broken server is distinguishable from an empty one and the app can retry.
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
   * `generate()` took ownership while the hydrate GET was in flight — the live
   * run's state must win over a stale mount-time failure.
   */
  private failHydration(error: Error): void {
    if (this.resumeSnapshot || this.isLoading || this.status !== 'idle') return
    this.setStatus('error')
    this.setError(error)
    this.callbacksRef.onError?.(error)
  }

  /**
   * Re-attach to an already-loaded `running` snapshot (the remount case). Safe
   * to call repeatedly: `rejoinInFlight` dedupes on `rejoinedRunId` and bails
   * when a run is already in flight, so on the first mount (where the rejoin was
   * already started from `repaintRestoredSnapshot`) this is a no-op.
   */
  private maybeResumeInFlight(): void {
    if (this.resumeSnapshot?.status !== 'running') return
    const runId = this.resumeSnapshot.resumeState?.runId
    if (runId) this.rejoinInFlight(runId)
  }

  /**
   * Re-attach to a run that is still generating and stream it to completion,
   * mirroring the chat client's mount-time rejoin. Reuses `processStream`, so
   * `result` / `progress` / `status` repaint from the replayed chunks exactly as
   * a live run does. Best-effort: a live `generate()` owns the client and is
   * never stomped, and the same run is only rejoined once.
   */
  private rejoinInFlight(runId: string): void {
    const joinRun = this.connection?.joinRun ?? this.joinRunHandler
    if (!joinRun) return
    if (this.rejoinedRunId === runId) return
    // A fresh send (or an in-progress rejoin) owns the client.
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
