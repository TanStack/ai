import { CHAIN_EVENTS } from '@tanstack/ai'
import { GENERATION_EVENTS } from './generation-types'
import { parseSSEResponse } from './sse-parser'
import { chainStepKey } from './chain-types'
import type { StreamChunk } from '@tanstack/ai/client'
import type { ChainStepEventValue } from '@tanstack/ai'
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
 * (`generation:result`, RUN_*), plus demuxes `chain:step` CUSTOM events into
 * a reactive {@link ChainSteps} map for progressive UIs.
 *
 * @template TInput - Chain input (e.g. `{ topic: string }`)
 * @template TResult - Final `generation:result` payload
 * @template TOutput - Stored result after optional transform
 *
 * @example
 * ```ts
 * const client = new ChainClient<{ topic: string }, BlogResult>({
 *   fetcher: (input, { signal }) =>
 *     createBlogPostChainFn({ data: input, signal }),
 *   onStepsChange: setSteps,
 *   onResultChange: setResult,
 * })
 * await client.run({ topic: 'urban foxes' })
 * client.getSteps()['draft']?.status // 'done'
 * ```
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
      this.setIsLoading(false)
    }
  }

  private async processStream(source: AsyncIterable<StreamChunk>): Promise<void> {
    for await (const chunk of source) {
      if (this.abortController?.signal.aborted) break

      this.callbacksRef.onChunk?.(chunk)

      // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- only handle lifecycle + chain events
      switch (chunk.type) {
        case 'CUSTOM': {
          if (chunk.name === CHAIN_EVENTS.STEP) {
            this.applyStepEvent(chunk.value)
          } else if (chunk.name === GENERATION_EVENTS.RESULT) {
            this.setResult(chunk.value as TResult)
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

  private applyStepEvent(value: unknown): void {
    if (!isChainStepEvent(value)) return

    const key = chainStepKey(value.step, value.branch)
    const prev = this.steps[key]
    let next: ChainStepState

    if (value.status === 'started') {
      next = {
        step: value.step,
        ...(value.branch !== undefined && { branch: value.branch }),
        index: value.index,
        status: 'active',
      }
    } else if (value.status === 'error') {
      next = {
        step: value.step,
        ...(value.branch !== undefined && { branch: value.branch }),
        index: value.index,
        status: 'error',
        error: value.error,
        ...(prev?.result !== undefined && { result: prev.result }),
      }
    } else {
      next = {
        step: value.step,
        ...(value.branch !== undefined && { branch: value.branch }),
        index: value.index,
        status: 'done',
        result: value.result,
      }
    }

    this.steps = { ...this.steps, [key]: next }
    this.callbacksRef.onStepsChange?.(this.steps)
    this.callbacksRef.onStep?.(next, this.steps)
  }

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

  reset(): void {
    this.stop()
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
