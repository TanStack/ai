import type { StreamChunk } from '@tanstack/ai/client'
import type { ConnectConnectionAdapter } from './connection-adapters'
import type {
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutputFromReturn,
} from './generation-types'

export type { InferGenerationOutputFromReturn }

/** Status of a single chain step (or parallel branch). */
export type ChainStepStatus = 'pending' | 'active' | 'done' | 'error'

/**
 * Reactive state for one step (or one branch of a parallel fan-out).
 * Keys in the steps map use {@link chainStepKey}.
 */
export interface ChainStepState {
  step: string
  branch?: string
  index?: number
  status: ChainStepStatus
  /** Present when `status === 'done'`. */
  result?: unknown
  /** Present when `status === 'error'`. */
  error?: string
  /**
   * Progressive structured-output object while this step streams
   * (`structured-output.start` + `TEXT_MESSAGE_CONTENT` JSON deltas, parsed
   * with `parsePartialJSON`). Cleared when the step finishes or a new run
   * starts. Same protocol as `useChat` / `useAssistant` chat surfaces.
   */
  partial?: unknown
}

/**
 * Map of step/branch key → state.
 * Values are optional so `steps.draft` / `steps['media/hero']` type-check as
 * possibly missing before that step has started.
 */
export type ChainSteps = {
  readonly [key: string]: ChainStepState | undefined
}

/**
 * Build the stable key used in {@link ChainSteps}.
 * Sequential steps: `"draft"`. Parallel branches: `"media/hero"`.
 */
export function chainStepKey(step: string, branch?: string): string {
  return branch ? `${step}/${branch}` : step
}

/**
 * Options for {@link ChainClient}.
 *
 * @template TInput - Chain input
 * @template TResult - Final `generation:result` payload type
 * @template TOutput - Stored result after optional `onResult` transform
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- _TInput is part of the public positional generic API
export interface ChainClientOptions<_TInput, TResult, TOutput = TResult> {
  /** Unique id for this client instance */
  id?: string
  /** Extra body fields merged into connect-adapter requests */
  body?: Record<string, unknown>

  /**
   * Transform the final `generation:result` payload before storage.
   * - Return a value → store it
   * - Return `null` → keep previous result
   * - Return `void` → store the raw result
   */
  onResult?: (result: TResult) => TOutput | null | void
  onError?: (error: Error) => void
  onChunk?: (chunk: StreamChunk) => void
  /** Fired for every `chain:step` event (after the steps map is updated). */
  onStep?: (step: ChainStepState, steps: ChainSteps) => void

  // Framework state callbacks (set by hooks)
  /** @internal */
  onResultChange?: (result: TOutput | null) => void
  /** @internal */
  onLoadingChange?: (isLoading: boolean) => void
  /** @internal */
  onErrorChange?: (error: Error | undefined) => void
  /** @internal */
  onStatusChange?: (status: GenerationClientState) => void
  /** @internal */
  onStepsChange?: (steps: ChainSteps) => void
}

export type ChainTransport<TInput, TResult> =
  | { connection: ConnectConnectionAdapter; fetcher?: never }
  | { fetcher: GenerationFetcher<TInput, TResult>; connection?: never }
