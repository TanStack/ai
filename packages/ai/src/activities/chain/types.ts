// packages/ai/src/activities/chain/types.ts
import type {
  ChatStream,
  StreamChunk,
  StructuredOutputStream,
} from '../../types.js'

/** Execution context handed to every chain step callback. */
export interface ChainContext {
  /** Aborts when the chain run is cancelled. Check after await points. */
  signal: AbortSignal
  /** The run's controller — pass to activities that accept one (e.g. chat). */
  abortController: AbortController
  /** Emit a CUSTOM progress event into the chain's combined stream. */
  emit: (name: string, value: unknown) => void
  threadId: string
  runId: string
}

/** Type-only carrier attached to `Chain.stream()`'s return so a nested
 *  chain's stream resolves to its output type when used as a step result.
 *  Never present at runtime — optional phantom (same pattern as
 *  `ChatResultMeta`). */
export interface ChainResultMeta<TOut> {
  readonly '~chainResult'?: TOut
}

/** The combined stream a chain produces: ordinary StreamChunks plus the
 *  phantom output-type carrier for nesting. */
export type ChainStream<TOut> = AsyncIterable<StreamChunk> &
  ChainResultMeta<TOut>

/**
 * What a step callback may return. The chain runtime resolves each variant
 * to a concrete `TOut` before invoking the next step:
 * - a plain value or promise → awaited value
 * - `StructuredOutputStream<TOut>` (chat with `outputSchema` + `stream: true`)
 *   → chunks are forwarded live, resolves to the validated object
 * - `ChatStream` (plain streaming chat) → chunks forwarded, resolves to the
 *   accumulated text (`TOut` must be `string`)
 * - `ChainStream<TOut>` (a nested chain's `.stream()`) → chunks forwarded,
 *   resolves to the nested chain's `generation:result` value
 */
export type ChainStepResult<TOut> =
  | TOut
  | Promise<TOut>
  | StructuredOutputStream<TOut>
  | ChainStream<TOut>
  | (TOut extends string ? ChatStream : never)

/** A named step: a function from the previous output to an activity result. */
export interface ChainStep<TIn, TOut> {
  name: string
  run: (input: TIn, ctx: ChainContext) => ChainStepResult<TOut>
}

/**
 * Resolves a step callback's raw return type to the value the next step
 * receives. Order matters: the phantom `ChainResultMeta` and
 * `StructuredOutputStream` checks must run before the wider `ChatStream` /
 * `AsyncIterable` fallbacks.
 */
export type ResolveStepResult<TResult> =
  TResult extends ChainResultMeta<infer TValue>
    ? TValue
    : TResult extends StructuredOutputStream<infer TValue>
      ? TValue
      : TResult extends ChatStream
        ? string
        : TResult extends AsyncIterable<StreamChunk>
          ? unknown
          : Awaited<TResult>

/** Options accepted by `Chain.stream()` / `Chain.invoke()`. */
export interface ChainRunOptions {
  abortController?: AbortController
  threadId?: string
  runId?: string
}

/** `Chain.step`: append a callback step or a pre-built `ChainStep` (e.g. a
 *  nested chain's `.asStep()`). The callback receives the previous step's
 *  resolved output. */
export interface ChainStepAdder<TIn, TOut> {
  <TResult>(
    name: string,
    run: (input: TOut, ctx: ChainContext) => TResult,
  ): Chain<TIn, ResolveStepResult<TResult>>
  <TNext>(step: ChainStep<TOut, TNext>): Chain<TIn, TNext>
}

/** The fluent chain builder / runner. Immutable: each `.step()` returns a
 *  new chain. */
export interface Chain<TIn, TOut> {
  /** Append a step. `run` receives the previous step's resolved output. */
  step: ChainStepAdder<TIn, TOut>

  /**
   * Append a parallel fan-out. Every branch receives the same input (the
   * previous step's output); the merged output is a record keyed by branch
   * name. Branch streams interleave into the combined stream.
   */
  parallel: <
    TBranches extends Record<
      string,
      (input: TOut, ctx: ChainContext) => unknown
    >,
  >(
    name: string,
    branches: TBranches,
  ) => Chain<
    TIn,
    { [K in keyof TBranches]: ResolveStepResult<ReturnType<TBranches[K]>> }
  >

  /**
   * Run the chain, streaming AG-UI chunks: RUN_STARTED, per-step
   * `chain:step` CUSTOM events, live chunks forwarded from streaming steps,
   * a final `generation:result`, then RUN_FINISHED (or RUN_ERROR).
   */
  stream: (input: TIn, options?: ChainRunOptions) => ChainStream<TOut>

  /** Run the chain without wire events and return the final output. */
  invoke: (input: TIn, options?: ChainRunOptions) => Promise<TOut>

  /** Package this chain as a step for composition into another chain. */
  asStep: (name?: string) => ChainStep<TIn, TOut>
}

/** CUSTOM event names emitted by the chain runtime. */
export const CHAIN_EVENTS = {
  /** Per-step lifecycle: `ChainStepEventValue`. */
  STEP: 'chain:step',
} as const

/** Value carried by a `chain:step` CUSTOM event. */
export type ChainStepEventValue =
  | {
      step: string
      index: number
      branch?: string
      status: 'started'
    }
  | {
      step: string
      index: number
      branch?: string
      status: 'done'
      result: unknown
    }
  | {
      step: string
      index: number
      branch?: string
      status: 'error'
      error: string
    }

/** Recovers a chain's input type. Both parameters are inferred (rather than
 *  wildcarded with `any`) because `Chain` is invariant in `TOut` — an
 *  `unknown` wildcard would fail the assignability check and collapse the
 *  conditional to `never`. */
export type InferChainInput<TChain> =
  TChain extends Chain<infer TIn, infer _TOut> ? TIn : never

/** Recovers a chain's final output type. */
export type InferChainOutput<TChain> =
  TChain extends Chain<infer _TIn, infer TOut> ? TOut : never
