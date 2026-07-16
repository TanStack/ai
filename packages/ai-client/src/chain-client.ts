import { CHAIN_EVENTS, parsePartialJSON } from '@tanstack/ai/client'
import { GENERATION_EVENTS } from './generation-types'
import { parseSSEResponse } from './sse-parser'
import { chainStepKey } from './chain-types'
import type { ChainStepEventValue, StreamChunk } from '@tanstack/ai/client'
import type {
  ConnectConnectionAdapter,
  RunAgentInputContext,
} from './connection-adapters'
import type {
  GenerationClientState,
  GenerationFetcher,
} from './generation-types'
import type {
  ChainClientOptions,
  ChainStepState,
  ChainSteps,
} from './chain-types'

interface ChainCallbacks<TResult, TOutput> {
  onResult?: ((result: TResult) => TOutput | null | void) | undefined
  onError?: ((error: Error) => void) | undefined
  onChunk?: ((chunk: StreamChunk) => void) | undefined
  onStep?: ((step: ChainStepState, steps: ChainSteps) => void) | undefined
  onResultChange?: ((result: TOutput | null) => void) | undefined
  onLoadingChange?: ((isLoading: boolean) => void) | undefined
  onErrorChange?: ((error: Error | undefined) => void) | undefined
  onStatusChange?: ((status: GenerationClientState) => void) | undefined
  onStepsChange?: ((steps: ChainSteps) => void) | undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isChainStepEvent(value: unknown): value is ChainStepEventValue {
  return (
    isRecord(value) &&
    typeof value.step === 'string' &&
    (value.status === 'started' ||
      value.status === 'done' ||
      value.status === 'error')
  )
}

/**
 * Client for a server-side `chain()` activity streamed as one AG-UI run.
 *
 * Understands the same outer lifecycle as {@link GenerationClient}
 * (`generation:result`, RUN_*), demuxes `chain:step` CUSTOM events into a
 * reactive {@link ChainSteps} map, and mirrors chat's native structured-output
 * protocol onto the active step:
 *
 * 1. `structured-output.start` — begin accumulating JSON for the current step
 * 2. `TEXT_MESSAGE_CONTENT` deltas — progressive `parsePartialJSON` → `step.partial`
 * 3. `structured-output.complete` / `chain:step` done — terminal object on `step.result`
 *
 * @template TInput - Chain input (e.g. `{ topic: string }`)
 * @template TResult - Final `generation:result` payload
 * @template TOutput - Stored result after optional transform
 */
export class ChainClient<
  TInput extends Record<string, unknown>,
  TResult,
  TOutput = TResult,
> {
  private readonly connection: ConnectConnectionAdapter | undefined
  private readonly fetcher: GenerationFetcher<TInput, TResult> | undefined
  private readonly uniqueId: string
  private readonly threadId: string
  private body: Record<string, unknown>
  private result: TOutput | null = null
  private steps: ChainSteps = {}
  private isLoading = false
  private error: Error | undefined = undefined
  private status: GenerationClientState = 'idle'
  private abortController: AbortController | null = null
  private readonly callbacksRef: ChainCallbacks<TResult, TOutput>

  /** Most recently `started` step key — structured deltas attach here. */
  private lastActiveStepKey: string | null = null
  /** Step currently receiving structured-output JSON (after `.start`). */
  private structuredTargetKey: string | null = null
  /** Accumulated raw JSON for the in-flight structured stream. */
  private structuredRaw = ''

  constructor(
    options: ChainClientOptions<TInput, TResult, TOutput> &
      (
        | { connection: ConnectConnectionAdapter; fetcher?: never }
        | {
            fetcher: GenerationFetcher<TInput, TResult>
            connection?: never
          }
      ),
  ) {
    this.uniqueId = options.id ?? this.generateUniqueId('chain')
    this.threadId = this.uniqueId
    this.connection = options.connection
    this.fetcher = options.fetcher
    this.body = options.body ?? {}

    this.callbacksRef = {
      onResult: options.onResult,
      onError: options.onError,
      onChunk: options.onChunk,
      onStep: options.onStep,
      onResultChange: options.onResultChange,
      onLoadingChange: options.onLoadingChange,
      onErrorChange: options.onErrorChange,
      onStatusChange: options.onStatusChange,
      onStepsChange: options.onStepsChange,
    }
  }

  /**
   * Run the chain. Only one run at a time; concurrent calls are no-ops.
   * Resolves with the stored result (after optional `onResult` transform),
   * or `null` if aborted / no `generation:result` arrived.
   */
  async run(input: TInput): Promise<TOutput | null> {
    if (this.isLoading) return this.result

    this.clearStructuredStream()
    this.setSteps({})
    this.setIsLoading(true)
    this.setStatus('generating')
    this.setError(undefined)

    const abortController = new AbortController()
    this.abortController = abortController
    const { signal } = abortController

    try {
      if (this.fetcher) {
        const result = await this.fetcher(input, { signal })
        if (signal.aborted) return null
        if (result instanceof Response) {
          await this.processStream(parseSSEResponse(result, signal))
        } else {
          this.setResult(result)
          this.setStatus('success')
        }
      } else if (this.connection) {
        const mergedData = { ...this.body, ...input }
        const stream = this.connection.connect(
          [],
          mergedData,
          signal,
          this.createRunContext(this.generateUniqueId('run')),
        )
        await this.processStream(stream)
      } else {
        throw new Error(
          'ChainClient requires either a connection or fetcher option',
        )
      }
      return signal.aborted ? null : this.result
    } catch (err: unknown) {
      if (signal.aborted) return null
      const error = err instanceof Error ? err : new Error(String(err))
      this.setError(error)
      this.setStatus('error')
      this.callbacksRef.onError?.(error)
      return null
    } finally {
      this.abortController = null
      this.clearStructuredStream()
      this.setIsLoading(false)
    }
  }

  private async processStream(
    source: AsyncIterable<StreamChunk>,
  ): Promise<void> {
    for await (const chunk of source) {
      if (this.abortController?.signal.aborted) break

      this.callbacksRef.onChunk?.(chunk)

      // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- only handle lifecycle + chain + structured-output events
      switch (chunk.type) {
        case 'CUSTOM': {
          if (chunk.name === CHAIN_EVENTS.STEP) {
            this.applyStepEvent(chunk.value)
          } else if (chunk.name === 'structured-output.start') {
            this.beginStructuredStream()
          } else if (chunk.name === 'structured-output.complete') {
            this.finishStructuredStream(chunk.value)
          } else if (chunk.name === GENERATION_EVENTS.RESULT) {
            this.setResult(chunk.value as TResult)
          }
          break
        }
        case 'TEXT_MESSAGE_CONTENT': {
          if (
            this.structuredTargetKey &&
            typeof chunk.delta === 'string' &&
            chunk.delta.length > 0
          ) {
            this.appendStructuredDelta(chunk.delta)
          }
          break
        }
        case 'RUN_FINISHED': {
          this.setStatus('success')
          break
        }
        case 'RUN_ERROR': {
          const msg =
            (chunk.message as string | undefined) ||
            chunk.error?.message ||
            'An error occurred'
          // Treat client abort as cancellation, not an error surface.
          if (msg === 'Aborted') {
            return
          }
          throw new Error(msg)
        }
        default:
          break
      }
    }

    // Stream ended without RUN_FINISHED but with a result — still success.
    if (this.status === 'generating' && this.result !== null) {
      this.setStatus('success')
    }
  }

  private beginStructuredStream(): void {
    // Attach to the step that most recently started (typically the chat step
    // that declared outputSchema). Without an active step, ignore.
    this.structuredTargetKey = this.lastActiveStepKey
    this.structuredRaw = ''
    if (!this.structuredTargetKey) return

    const prev = this.steps[this.structuredTargetKey]
    if (!prev || prev.status !== 'active') return

    // Clear any stale partial from a previous structured attempt on this step.
    this.patchStep(this.structuredTargetKey, {
      ...prev,
      partial: undefined,
    })
  }

  private appendStructuredDelta(delta: string): void {
    const key = this.structuredTargetKey
    if (!key) return

    const prev = this.steps[key]
    if (!prev || prev.status !== 'active') return

    this.structuredRaw += delta
    const progressive = parsePartialJSON(this.structuredRaw)
    // Keep the last good partial when the buffer isn't a parseable prefix yet
    // (same behavior as chat's appendStructuredOutputDelta).
    const nextPartial =
      progressive !== undefined && progressive !== null
        ? progressive
        : prev.partial

    this.patchStep(key, {
      ...prev,
      ...(nextPartial !== undefined ? { partial: nextPartial } : {}),
    })
  }

  private finishStructuredStream(value: unknown): void {
    const key = this.structuredTargetKey
    this.clearStructuredStream()
    if (!key) return

    const prev = this.steps[key]
    if (!prev || prev.status !== 'active') return

    // Prefer the validated object on complete so partial jumps to final shape
    // before the outer chain:step done event arrives.
    if (isRecord(value) && 'object' in value) {
      this.patchStep(key, {
        ...prev,
        partial: value.object,
      })
    }
  }

  private applyStepEvent(value: unknown): void {
    if (!isChainStepEvent(value)) return

    const key = chainStepKey(value.step, value.branch)
    const prev = this.steps[key]
    let next: ChainStepState

    if (value.status === 'started') {
      this.lastActiveStepKey = key
      next = {
        step: value.step,
        ...(value.branch !== undefined && { branch: value.branch }),
        index: value.index,
        status: 'active',
      }
    } else if (value.status === 'error') {
      if (this.structuredTargetKey === key) {
        this.clearStructuredStream()
      }
      next = {
        step: value.step,
        ...(value.branch !== undefined && { branch: value.branch }),
        index: value.index,
        status: 'error',
        error: value.error,
        ...(prev?.result !== undefined && { result: prev.result }),
        ...(prev?.partial !== undefined && { partial: prev.partial }),
      }
    } else {
      if (this.structuredTargetKey === key) {
        this.clearStructuredStream()
      }
      next = {
        step: value.step,
        ...(value.branch !== undefined && { branch: value.branch }),
        index: value.index,
        status: 'done',
        result: value.result,
        // Drop partial once the validated result is on the step.
      }
    }

    this.patchStep(key, next)
  }

  private patchStep(key: string, next: ChainStepState): void {
    this.steps = { ...this.steps, [key]: next }
    this.callbacksRef.onStepsChange?.(this.steps)
    this.callbacksRef.onStep?.(next, this.steps)
  }

  private clearStructuredStream(): void {
    this.structuredTargetKey = null
    this.structuredRaw = ''
  }

  stop(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.clearStructuredStream()
    this.setIsLoading(false)
    if (this.status === 'generating') {
      this.setStatus('idle')
    }
  }

  reset(): void {
    this.stop()
    this.lastActiveStepKey = null
    this.setResult(null)
    this.setSteps({})
    this.setError(undefined)
    this.setStatus('idle')
  }

  updateOptions(
    options: Partial<
      Pick<
        ChainClientOptions<TInput, TResult, TOutput>,
        'body' | 'onResult' | 'onError' | 'onChunk' | 'onStep'
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
    if (options.onChunk !== undefined) {
      this.callbacksRef.onChunk = options.onChunk
    }
    if (options.onStep !== undefined) {
      this.callbacksRef.onStep = options.onStep
    }
  }

  dispose(): void {
    this.stop()
  }

  getResult(): TOutput | null {
    return this.result
  }

  getSteps(): ChainSteps {
    return this.steps
  }

  getStep(step: string, branch?: string): ChainStepState | undefined {
    return this.steps[chainStepKey(step, branch)]
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

  private setResult(rawResult: TResult | null): void {
    if (rawResult === null) {
      this.result = null
      this.callbacksRef.onResultChange?.(null)
      return
    }

    if (this.callbacksRef.onResult) {
      const transformed = this.callbacksRef.onResult(rawResult)
      if (transformed === null) {
        return
      }
      if (transformed !== undefined) {
        this.result = transformed
        this.callbacksRef.onResultChange?.(this.result)
        return
      }
    }

    // eslint-disable-next-line no-restricted-syntax -- TOutput defaults to TResult when no onResult is supplied
    this.result = rawResult as unknown as TOutput
    this.callbacksRef.onResultChange?.(this.result)
  }

  private setSteps(steps: ChainSteps): void {
    this.steps = steps
    this.callbacksRef.onStepsChange?.(steps)
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
