/**
 * Summarize Activity
 *
 * Generates summaries from text input.
 * This is a self-contained module with implementation, types, and JSDoc.
 */

import { aiEventClient } from '@tanstack/ai-event-client'
import { streamGenerationResult } from '../stream-generation-result.js'
import { resolveDebugOption } from '../../logger/resolve'
import {
  applyGenerationResultTransforms,
  createGenerationContext,
  runGenerationAbort,
  runGenerationError,
  runGenerationFinish,
  runGenerationStart,
  runGenerationUsage,
} from '../middleware/run'
import {
  abortReasonMessage,
  createActivityAbortControls,
  isActivityAbortError,
  raceWithAbort,
} from '../../utilities/activity-abort'
import type { InternalLogger } from '../../logger/internal-logger'
import type { DebugOption } from '../../logger/types'
import type { GenerationMiddleware } from '../middleware/types'
import type { SummarizeAdapter } from './adapter'
import type { StreamChunk, SummarizationResult } from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'summarize' as const

// ===========================
// Type Extraction Helpers
// ===========================

/** Extract provider options from a SummarizeAdapter via ~types */
export type SummarizeProviderOptions<TAdapter> =
  TAdapter extends SummarizeAdapter<any, any>
    ? TAdapter['~types']['providerOptions']
    : object

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the summarize activity.
 * The model is extracted from the adapter's model property.
 *
 * @template TAdapter - The summarize adapter type
 * @template TStream - Whether to stream the output
 */
export interface SummarizeActivityOptions<
  TAdapter extends SummarizeAdapter<string, object>,
  TStream extends boolean = false,
> {
  /** The summarize adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** The text to summarize */
  text: string
  /** Maximum length of the summary (in words or characters, provider-dependent) */
  maxLength?: number
  /** Style of summary to generate */
  style?: 'bullet-points' | 'paragraph' | 'concise'
  /** Topics or aspects to focus on in the summary */
  focus?: Array<string>
  /** Provider-specific options */
  modelOptions?: SummarizeProviderOptions<TAdapter>
  /**
   * Optional run identity. When set on a streaming summarize, it is stamped
   * onto the emitted `RUN_STARTED` so a delivery-durable route keys the run's
   * log by the same id the client rejoins with — making a mid-run reload
   * resumable. Filed under `threadId` when persistence is wired.
   */
  runId?: string
  /**
   * Stable conversation/thread id for correlating this run when persisted — the
   * slot a reloading client hydrates the last summary by. Pass it whenever
   * persistence is on; `withGenerationPersistence` refuses a run without one.
   */
  threadId?: string
  /**
   * Observe-only middleware notified on start, usage, success, and error. Pass
   * `otelMiddleware()` for OpenTelemetry, `withGenerationPersistence()` to
   * record the run (summaries are text, so the run record holds the result and
   * there are no artifacts to store), or implement the `GenerationMiddleware`
   * contract for a custom backend.
   *
   * Streaming and non-streaming behave the same way: one `onStart`, then a
   * terminal `onFinish` / `onError`, with the result transforms applied to the
   * `SummarizationResult` in between. A streaming consumer that disconnects
   * mid-summary fires `onAbort`.
   */
  middleware?: Array<GenerationMiddleware>
  /**
   * Maximum duration of this activity invocation in milliseconds.
   * No SDK-wide default — choose a value suitable for the provider and job.
   * Composed with {@link abortSignal}; the first abort wins.
   */
  timeout?: number
  /**
   * Caller cancellation signal (request disconnects, job/runtime cancellation).
   * Composed with {@link timeout} into an effective signal forwarded to the
   * adapter. Request-specific — not stored on global provider client config.
   */
  abortSignal?: AbortSignal
  /**
   * Whether to stream the summarization result.
   * When true, returns an AsyncIterable<StreamChunk> for streaming output.
   * When false or not provided, returns a Promise<SummarizationResult>.
   *
   * @default false
   */
  stream?: TStream
  /**
   * Enable debug logging. Pass `true` to enable all categories, `false` to
   * silence everything including errors, or a `DebugConfig` object for granular
   * control and/or a custom `Logger`.
   */
  debug?: DebugOption
}

// ===========================
// Activity Result Type
// ===========================

/**
 * Result type for the summarize activity.
 * - If stream is true: AsyncIterable<StreamChunk>
 * - Otherwise: Promise<SummarizationResult>
 */
export type SummarizeActivityResult<TStream extends boolean> =
  TStream extends true
    ? AsyncIterable<StreamChunk>
    : Promise<SummarizationResult>

// ===========================
// Helper Functions
// ===========================

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ===========================
// Activity Implementation
// ===========================

/**
 * Summarize activity - generates summaries from text.
 *
 * Supports both streaming and non-streaming modes.
 *
 * @example Basic summarization
 * ```ts
 * import { summarize } from '@tanstack/ai'
 * import { openaiSummarize } from '@tanstack/ai-openai'
 *
 * const result = await summarize({
 *   adapter: openaiSummarize('gpt-4o-mini'),
 *   text: 'Long article text here...'
 * })
 *
 * console.log(result.summary)
 * ```
 *
 * @example Summarization with style
 * ```ts
 * const result = await summarize({
 *   adapter: openaiSummarize('gpt-4o-mini'),
 *   text: 'Long article text here...',
 *   style: 'bullet-points',
 *   maxLength: 100
 * })
 * ```
 *
 * @example Focused summarization
 * ```ts
 * const result = await summarize({
 *   adapter: openaiSummarize('gpt-4o-mini'),
 *   text: 'Long technical document...',
 *   focus: ['key findings', 'methodology']
 * })
 * ```
 *
 * @example Streaming summarization
 * ```ts
 * for await (const chunk of summarize({
 *   adapter: openaiSummarize('gpt-4o-mini'),
 *   text: 'Long article text here...',
 *   stream: true
 * })) {
 *   if (chunk.type === 'content') {
 *     process.stdout.write(chunk.delta)
 *   }
 * }
 * ```
 */
export function summarize<
  TAdapter extends SummarizeAdapter<string, object>,
  TStream extends boolean = false,
>(
  options: SummarizeActivityOptions<TAdapter, TStream>,
): SummarizeActivityResult<TStream> {
  const { stream } = options

  if (stream) {
    return runStreamingSummarize(
      options as SummarizeActivityOptions<
        SummarizeAdapter<string, object>,
        true
      >,
    ) as SummarizeActivityResult<TStream>
  }

  return runSummarize(
    options as SummarizeActivityOptions<
      SummarizeAdapter<string, object>,
      false
    >,
  ) as SummarizeActivityResult<TStream>
}

/**
 * Run non-streaming summarization
 */
async function runSummarize(
  options: SummarizeActivityOptions<SummarizeAdapter<string, object>, false>,
): Promise<SummarizationResult> {
  const {
    adapter,
    text,
    maxLength,
    style,
    focus,
    modelOptions,
    middleware,
    timeout,
    abortSignal: callerAbortSignal,
  } = options
  const model = adapter.model
  const requestId = createId('summarize')
  const inputLength = text.length
  const startTime = Date.now()
  const logger: InternalLogger = resolveDebugOption(options.debug)
  const abortControls = createActivityAbortControls({
    timeout,
    abortSignal: callerAbortSignal,
  })

  const mwCtx = createGenerationContext({
    requestId,
    activity: 'summarize',
    provider: adapter.name,
    model,
    modelOptions,
    threadId: options.threadId,
    runId: options.runId,
    createId,
  })

  await runGenerationStart(middleware, mwCtx)

  aiEventClient.emit('summarize:request:started', {
    requestId,
    provider: adapter.name,
    model,
    inputLength,
    timestamp: startTime,
  })

  logger.request(`activity=summarize provider=${adapter.name}`, {
    provider: adapter.name,
    model,
    inputLength,
  })

  const summarizeOptions = {
    model,
    text,
    maxLength,
    style,
    focus,
    modelOptions,
    logger,
    ...(abortControls.signal ? { abortSignal: abortControls.signal } : {}),
  }

  try {
    const rawResult = await raceWithAbort(
      adapter.summarize(summarizeOptions),
      abortControls.signal,
    )
    abortControls.clear()
    // Transforms run before anything observes the result — the same order every
    // media activity uses — so the run record and the returned value are the
    // same object.
    const result = await applyGenerationResultTransforms(mwCtx, rawResult)

    const duration = Date.now() - startTime
    const outputLength = result.summary.length

    aiEventClient.emit('summarize:request:completed', {
      requestId,
      provider: adapter.name,
      model,
      inputLength,
      outputLength,
      duration,
      timestamp: Date.now(),
    })

    logger.output(`activity=summarize length=${outputLength}`, {
      hasSummary: !!result.summary,
      outputLength,
    })

    if (result.usage) await runGenerationUsage(middleware, mwCtx, result.usage)
    await runGenerationFinish(middleware, mwCtx, {
      duration,
      usage: result.usage,
    })

    return result
  } catch (error) {
    abortControls.clear()
    const duration = Date.now() - startTime
    if (isActivityAbortError(error, abortControls.signal)) {
      await runGenerationAbort(middleware, mwCtx, {
        reason: abortReasonMessage(error, abortControls.signal),
        duration,
      })
    } else {
      await runGenerationError(middleware, mwCtx, {
        error,
        duration,
      })
    }
    logger.errors('summarize activity failed', {
      error,
      source: 'summarize',
    })
    throw error
  }
}

/** Read a `usage` off a transformed result without asserting its shape. */
function usageOf(result: unknown): SummarizationResult['usage'] | undefined {
  if (typeof result !== 'object' || result === null) return undefined
  const usage = (result as { usage?: unknown }).usage
  return typeof usage === 'object' && usage !== null
    ? (usage as SummarizationResult['usage'])
    : undefined
}

/**
 * Run streaming summarization
 * Uses the adapter's native streaming if available, otherwise falls back
 * to non-streaming and yields the result as a single chunk.
 */
async function* runStreamingSummarize(
  options: SummarizeActivityOptions<SummarizeAdapter<string, object>, true>,
): AsyncIterable<StreamChunk> {
  const {
    adapter,
    text,
    maxLength,
    style,
    focus,
    modelOptions,
    runId,
    threadId,
  } = options
  const model = adapter.model
  const logger: InternalLogger = resolveDebugOption(options.debug)

  logger.request(`activity=summarize provider=${adapter.name}`, {
    provider: adapter.name,
    model,
    stream: true,
  })

  // Thread the caller's run identity through so the emitted `RUN_STARTED`
  // carries it — keeps a delivery-durable route's log keyed by the id the
  // client rejoins with (mid-run reload resumability). Conditional spreads keep
  // the fields off the object entirely under `exactOptionalPropertyTypes`.
  const summarizeOptions = {
    model,
    text,
    maxLength,
    style,
    focus,
    modelOptions,
    logger,
    ...(runId !== undefined ? { runId } : {}),
    ...(threadId !== undefined ? { threadId } : {}),
  }

  // Use real streaming if the adapter supports it
  if (adapter.summarizeStream) {
    yield* runNativeSummarizeStream(
      options,
      adapter.summarizeStream(summarizeOptions),
      logger,
    )
    return
  }

  try {
    // Fall back to non-streaming — wrap the result with streamGenerationResult,
    // forwarding the run identity so its RUN_STARTED matches too. The generation
    // itself goes through `runSummarize`, so middleware (and its result
    // transforms) run exactly as they do for a non-streaming call. Only `runId`
    // is taken from the resolved wire identity — `threadId` stays the CALLER's,
    // since a minted one would file the run in a slot no client can hydrate.
    yield* streamGenerationResult(
      (resolved) =>
        runSummarize({ ...options, stream: false, runId: resolved.runId }),
      {
        ...(runId !== undefined ? { runId } : {}),
        ...(threadId !== undefined ? { threadId } : {}),
      },
    )
  } catch (error) {
    logger.errors('summarize activity failed', {
      error,
      source: 'summarize',
    })
    throw error
  }
}

/**
 * Drive an adapter's native `summarizeStream`, wiring the generation middleware
 * around it.
 *
 * The adapter emits a terminal `generation:result` CUSTOM chunk carrying the
 * assembled {@link SummarizationResult}; that is the one point where a result
 * exists, so the transforms run there and the REWRITTEN result is what gets
 * yielded — the client and the persisted run record then hold the same object.
 * An adapter whose stream never emits one still finishes the run, just with no
 * result recorded.
 */
async function* runNativeSummarizeStream(
  options: SummarizeActivityOptions<SummarizeAdapter<string, object>, true>,
  stream: AsyncIterable<StreamChunk>,
  logger: InternalLogger,
): AsyncIterable<StreamChunk> {
  const { adapter, middleware, modelOptions } = options
  const mwCtx = createGenerationContext({
    requestId: createId('summarize'),
    activity: 'summarize',
    provider: adapter.name,
    model: adapter.model,
    modelOptions,
    threadId: options.threadId,
    runId: options.runId,
    createId,
  })

  await runGenerationStart(middleware, mwCtx)

  const startTime = Date.now()
  // Tracks whether a terminal hook already fired, so the `finally` can report an
  // abandoned stream without double-firing. Mirrors the streaming video path.
  let settled = false
  try {
    for await (const chunk of stream) {
      if (chunk.type === 'CUSTOM' && chunk.name === 'generation:result') {
        const result = await applyGenerationResultTransforms<unknown>(
          mwCtx,
          chunk.value,
        )
        const usage = usageOf(result)
        // Finish before yielding the terminal chunks: a consumer that stops
        // reading once it has the result must not trip the abandonment path.
        if (usage) await runGenerationUsage(middleware, mwCtx, usage)
        await runGenerationFinish(middleware, mwCtx, {
          duration: Date.now() - startTime,
          usage,
        })
        settled = true
        yield { ...chunk, value: result }
        continue
      }
      yield chunk
    }
    if (!settled) {
      await runGenerationFinish(middleware, mwCtx, {
        duration: Date.now() - startTime,
      })
      settled = true
    }
  } catch (error) {
    settled = true
    await runGenerationError(middleware, mwCtx, {
      error,
      duration: Date.now() - startTime,
    })
    logger.errors('summarize activity failed', {
      error,
      source: 'summarize',
    })
    throw error
  } finally {
    if (!settled) {
      // The consumer abandoned the stream mid-summary, so the generator is being
      // unwound at a `yield`. Report a cancel, not an error, so an observer ends
      // its span (and persistence marks the run interrupted) instead of leaving
      // the run open forever.
      await runGenerationAbort(middleware, mwCtx, {
        reason: 'Summarize stream abandoned before completion',
        duration: Date.now() - startTime,
      })
    }
  }
}

// ===========================
// Options Factory
// ===========================

/**
 * Create typed options for the summarize() function without executing.
 */
export function createSummarizeOptions<
  TAdapter extends SummarizeAdapter<string, object>,
  TStream extends boolean = false,
>(
  options: SummarizeActivityOptions<TAdapter, TStream>,
): SummarizeActivityOptions<TAdapter, TStream> {
  return options
}

// Re-export adapter types
export type {
  SummarizeAdapter,
  SummarizeAdapterConfig,
  AnySummarizeAdapter,
} from './adapter'
export { BaseSummarizeAdapter } from './adapter'
export {
  ChatStreamSummarizeAdapter,
  type ChatStreamCapable,
  type InferTextProviderOptions,
} from './chat-stream-summarize'
