import { ChainClient } from '@tanstack/ai-client'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { StreamChunk } from '@tanstack/ai'
import type {
  ChainStepState,
  ChainSteps,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutputFromReturn,
} from '@tanstack/ai-client'

/**
 * Options for {@link useChain}.
 *
 * Accepts either a `connection` (streaming transport) or a `fetcher` that
 * returns a `Response` with an SSE body (typical for `createServerFn` +
 * `toServerSentEventsResponse(chain.stream(...))`).
 */
export interface UseChainOptions<TInput, TResult, TOutput = TResult> {
  connection?: ConnectConnectionAdapter
  fetcher?: GenerationFetcher<TInput, TResult>
  id?: string
  body?: Record<string, unknown>
  onResult?: (result: TResult) => TOutput | null | void
  onError?: (error: Error) => void
  onChunk?: (chunk: StreamChunk) => void
  /** Fired after each `chain:step` updates the steps map. */
  onStep?: (step: ChainStepState, steps: ChainSteps) => void
}

export interface UseChainReturn<TInput, TOutput> {
  /** Start a chain run. Resolves to the final result (or `null` if aborted/failed). */
  run: (input: TInput) => Promise<TOutput | null>
  /** Final `generation:result` payload (after optional transform). */
  result: TOutput | null
  /**
   * Live step map. Keys are step names (`"draft"`) or parallel branch paths
   * (`"media/hero"`). See `chainStepKey` from `@tanstack/ai-client`.
   */
  steps: ChainSteps
  isLoading: boolean
  error: Error | undefined
  status: GenerationClientState
  stop: () => void
  reset: () => void
  /** Lookup a step (or parallel branch) by name. */
  getStep: (step: string, branch?: string) => ChainStepState | undefined
}

/**
 * React hook for a server-side `chain()` activity.
 *
 * Demuxes one SSE run into:
 * - `result` — terminal `generation:result`
 * - `steps` — progressive `chain:step` state for UI (drafting / hero / …)
 * - `steps[name].partial` — live structured-output object while a step streams
 *   (native `structured-output.start` + JSON text deltas + `.complete`)
 * - live chunks via `onChunk` for anything else you want to handle yourself
 *
 * @example
 * ```tsx
 * const chain = useChain<{ topic: string }, BlogStudioChainResult>({
 *   fetcher: (input, { signal }) =>
 *     createBlogPostChainFn({ data: input, signal }),
 * })
 *
 * await chain.run({ topic: 'urban foxes' })
 * chain.steps['draft']?.partial // { title?: string, body?: string, ... }
 * chain.steps['draft']?.result  // full validated object when the step finishes
 * chain.steps['media/hero']?.result
 * chain.result // { post, hero, narration }
 * ```
 */
export function useChain<
  TInput extends Record<string, unknown>,
  TResult,
  TTransformed = void,
>(
  options: Omit<UseChainOptions<TInput, TResult>, 'onResult'> & {
    onResult?: (result: TResult) => TTransformed
  },
): UseChainReturn<
  TInput,
  InferGenerationOutputFromReturn<TResult, TTransformed>
> {
  type TOutput = InferGenerationOutputFromReturn<TResult, TTransformed>
  const hookId = useId()
  const clientId = options.id || hookId

  const [result, setResult] = useState<TOutput | null>(null)
  const [steps, setSteps] = useState<ChainSteps>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | undefined>(undefined)
  const [status, setStatus] = useState<GenerationClientState>('idle')

  const optionsRef = useRef(options)
  optionsRef.current = options

  const client = useMemo(() => {
    const opts = optionsRef.current

    const clientOptions = {
      id: clientId,
      body: opts.body,
      onResult: ((r: TResult) => optionsRef.current.onResult?.(r)) as (
        result: TResult,
      ) => TOutput | null | void,
      onError: (e: Error) => {
        optionsRef.current.onError?.(e)
      },
      onChunk: (c: StreamChunk) => {
        optionsRef.current.onChunk?.(c)
      },
      onStep: (step: ChainStepState, all: ChainSteps) => {
        optionsRef.current.onStep?.(step, all)
      },
      onResultChange: setResult,
      onStepsChange: setSteps,
      onLoadingChange: setIsLoading,
      onErrorChange: setError,
      onStatusChange: setStatus,
    }

    if (opts.connection) {
      return new ChainClient<TInput, TResult, TOutput>({
        ...clientOptions,
        connection: opts.connection,
      })
    }

    if (opts.fetcher) {
      return new ChainClient<TInput, TResult, TOutput>({
        ...clientOptions,
        fetcher: opts.fetcher,
      })
    }

    throw new Error('useChain requires either a connection or fetcher option')
  }, [clientId])

  useEffect(() => {
    client.updateOptions({
      ...(options.body !== undefined && { body: options.body }),
    })
  }, [client, options.body])

  useEffect(() => {
    return () => {
      client.dispose()
    }
  }, [client])

  const run = useCallback(
    async (input: TInput) => {
      return client.run(input)
    },
    [client],
  )

  const stop = useCallback(() => {
    client.stop()
  }, [client])

  const reset = useCallback(() => {
    client.reset()
  }, [client])

  const getStep = useCallback(
    (step: string, branch?: string) => client.getStep(step, branch),
    [client],
  )

  return {
    run,
    result,
    steps,
    isLoading,
    error,
    status,
    stop,
    reset,
    getStep,
  }
}
