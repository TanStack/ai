import { GENERATION_EVENTS } from './generation-types'
import { parseSSEResponse } from './sse-parser'
import type { StreamChunk } from '@tanstack/ai'
import type { ConnectConnectionAdapter } from './connection-adapters'
import type {
  GenerationClientOptions,
  GenerationClientState,
  GenerationFetcher,
} from './generation-types'

/**
 * Callbacks stored in a ref so hooks can update them without recreating the client.
 */
interface GenerationCallbacks<TResult, TOutput> {
  onResult?: (result: TResult) => TOutput | null | void
  onError?: (error: Error) => void
  onProgress?: (progress: number, message?: string) => void
  onChunk?: (chunk: StreamChunk) => void
  onResultChange?: (result: TOutput | null) => void
  onLoadingChange?: (isLoading: boolean) => void
  onErrorChange?: (error: Error | undefined) => void
  onStatusChange?: (status: GenerationClientState) => void
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
  private connection: ConnectConnectionAdapter | undefined
  private fetcher: GenerationFetcher<TInput, TResult> | undefined
  private body: Record<string, any>
  private result: TOutput | null = null
  private isLoading = false
  private error: Error | undefined = undefined
  private status: GenerationClientState = 'idle'
  private abortController: AbortController | null = null
  private callbacksRef: GenerationCallbacks<TResult, TOutput>

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
  }

  /**
   * Trigger a generation request.
   * Only one generation can be in-flight at a time; calling generate()
   * while already generating will be a no-op.
   */
  async generate(input: TInput): Promise<void> {
    if (this.isLoading) return

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
          await this.processStream(parseSSEResponse(result, signal))
        } else {
          this.setResult(result)
          this.setStatus('success')
        }
      } else if (this.connection) {
        // Streaming adapter path
        const mergedData = { ...this.body, ...input }
        const stream = this.connection.connect([], mergedData, signal)
        await this.processStream(stream)
      } else {
        throw new Error(
          'GenerationClient requires either a connection or fetcher option',
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
   * Process a stream of AG-UI events from the streaming connection adapter.
   */
  private async processStream(
    source: AsyncIterable<StreamChunk>,
  ): Promise<void> {
    for await (const chunk of source) {
      if (this.abortController?.signal.aborted) break

      this.callbacksRef.onChunk?.(chunk)

      switch (chunk.type) {
        case 'CUSTOM': {
          if (chunk.name === GENERATION_EVENTS.RESULT) {
            this.setResult(chunk.value as TResult)
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
          throw new Error(chunk.error.message)
        }
      }
    }
  }

  /**
   * Abort any in-flight generation request.
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
   * Clear the result, error, and return to idle state.
   */
  reset(): void {
    this.stop()
    this.setResult(null)
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
