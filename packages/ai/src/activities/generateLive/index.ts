/**
 * Live Activity (Experimental)
 *
 * Opens a live, prompt-steerable video session. Unlike generateVideo (a job
 * that finishes with a URL), a live session stays open: the client connects
 * with the returned token, sets the prompt, and streams until stop/close.
 *
 * @experimental Live generation is an experimental feature and may change.
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
import type { LiveAdapter } from './adapter'
import type { StreamChunk, LiveGenerationResult } from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'live' as const

// ===========================
// Type Extraction Helpers
// ===========================

/**
 * Extract provider options from a LiveAdapter via ~types.
 */
export type LiveProviderOptions<TAdapter> = TAdapter extends {
  '~types': { providerOptions: infer P extends object }
}
  ? P
  : object

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the live generation activity.
 * The model is extracted from the adapter's model property.
 *
 * @template TAdapter - The live adapter type
 * @template TStream - Whether to stream the output
 *
 * @experimental Live generation is an experimental feature and may change.
 */
export interface LiveActivityOptions<
  TAdapter extends LiveAdapter<string, LiveProviderOptions<TAdapter>>,
  TStream extends boolean = false,
> {
  /** The live adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** Natural-language description of the shot or scene */
  prompt: string
  /** Provider-specific options for live generation */
  modelOptions?: LiveProviderOptions<TAdapter>
  /**
   * Whether to stream the generation result.
   * When true, returns an AsyncIterable<StreamChunk> for streaming transport.
   * When false or not provided, returns a Promise<LiveGenerationResult>.
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
  /**
   * Observe-only middleware notified on start, usage, success, and error. Pass
   * `otelMiddleware()` to emit OpenTelemetry spans, or implement the
   * `GenerationMiddleware` contract for a custom backend.
   */
  middleware?: Array<GenerationMiddleware>
  /** Stable conversation/thread id for correlating this run when persisted. */
  threadId?: string
  /** Stable run id for correlating this run when persisted. */
  runId?: string
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
}

// ===========================
// Activity Result Type
// ===========================

/**
 * Result type for the live generation activity.
 * - If stream is true: AsyncIterable<StreamChunk>
 * - Otherwise: Promise<LiveGenerationResult>
 */
export type LiveActivityResult<TStream extends boolean = false> =
  TStream extends true
    ? AsyncIterable<StreamChunk>
    : Promise<LiveGenerationResult>

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ===========================
// Activity Implementation
// ===========================

/**
 * Live generation activity - opens a live, prompt-steerable video session.
 *
 * @example Mint a session token on the server
 * ```ts
 * import { generateLive } from '@tanstack/ai'
 * import { reactorVideo } from '@tanstack/ai-reactor'
 *
 * const live = await generateLive({
 *   adapter: reactorVideo('helios'),
 *   prompt: 'A red sports car powerslides a mountain hairpin',
 * })
 *
 * // Hand live.token, live.model, and live.prompt to the browser.
 * ```
 *
 * @experimental Live generation is an experimental feature and may change.
 */
export function generateLive<
  TAdapter extends LiveAdapter<string, LiveProviderOptions<TAdapter>>,
  TStream extends boolean = false,
>(
  options: LiveActivityOptions<TAdapter, TStream>,
): LiveActivityResult<TStream> {
  if (options.stream) {
    return streamGenerationResult(
      (resolved) => runGenerateLive({ ...options, runId: resolved.runId }),
      options,
    ) as LiveActivityResult<TStream>
  }
  return runGenerateLive(options) as LiveActivityResult<TStream>
}

/**
 * Run the core live generation logic (non-streaming).
 */
async function runGenerateLive<
  TAdapter extends LiveAdapter<string, LiveProviderOptions<TAdapter>>,
>(
  options: LiveActivityOptions<TAdapter, boolean>,
): Promise<LiveGenerationResult> {
  const {
    adapter,
    stream: _stream,
    debug: _debug,
    middleware,
    threadId,
    runId,
    timeout,
    abortSignal: callerAbortSignal,
    ...rest
  } = options
  const model = adapter.model
  const requestId = createId('live')
  const startTime = Date.now()
  const logger: InternalLogger = resolveDebugOption(options.debug)
  const abortControls = createActivityAbortControls({
    timeout,
    abortSignal: callerAbortSignal,
  })
  const providerName =
    (adapter as { name?: string; provider?: string }).provider ??
    (adapter as { name?: string }).name ??
    'unknown'

  const mwCtx = createGenerationContext({
    requestId,
    activity: 'live',
    provider: adapter.name,
    model,
    modelOptions: rest.modelOptions,
    threadId,
    runId,
    artifactInputs: { prompt: rest.prompt },
    createId,
  })

  await runGenerationStart(middleware, mwCtx)

  aiEventClient.emit('live:request:started', {
    requestId,
    provider: adapter.name,
    model,
    prompt: rest.prompt,
    timestamp: startTime,
    ...(rest.modelOptions !== undefined && {
      modelOptions: rest.modelOptions as Record<string, unknown>,
    }),
  })

  logger.request(`activity=generateLive provider=${providerName}`, {
    provider: providerName,
    model,
  })

  try {
    const rawResult = await raceWithAbort(
      adapter.createLive({
        ...rest,
        model,
        logger,
        ...(abortControls.signal ? { abortSignal: abortControls.signal } : {}),
      }),
      abortControls.signal,
    )
    abortControls.clear()
    const result = await applyGenerationResultTransforms(mwCtx, rawResult)
    const elapsedMs = Date.now() - startTime

    aiEventClient.emit('live:request:completed', {
      requestId,
      provider: adapter.name,
      model: result.model,
      prompt: result.prompt,
      status: result.status,
      duration: elapsedMs,
      timestamp: Date.now(),
      ...(rest.modelOptions !== undefined && {
        modelOptions: rest.modelOptions as Record<string, unknown>,
      }),
    })

    if (result.usage) {
      aiEventClient.emit('live:usage', {
        requestId,
        model: result.model,
        usage: result.usage,
        timestamp: Date.now(),
        ...(rest.modelOptions !== undefined && {
          modelOptions: rest.modelOptions as Record<string, unknown>,
        }),
      })
    }

    logger.output(`activity=generateLive provider=${providerName}`, {
      model: result.model,
      status: result.status,
    })

    if (result.usage) await runGenerationUsage(middleware, mwCtx, result.usage)
    await runGenerationFinish(middleware, mwCtx, {
      duration: elapsedMs,
      usage: result.usage,
    })

    return result
  } catch (error) {
    abortControls.clear()
    const elapsedMs = Date.now() - startTime
    const err = error as Error
    aiEventClient.emit('live:request:error', {
      requestId,
      provider: adapter.name,
      model,
      error: { message: err.message, name: err.name },
      duration: elapsedMs,
      timestamp: Date.now(),
      ...(rest.modelOptions !== undefined && {
        modelOptions: rest.modelOptions as Record<string, unknown>,
      }),
    })
    if (isActivityAbortError(error, abortControls.signal)) {
      await runGenerationAbort(middleware, mwCtx, {
        reason: abortReasonMessage(error, abortControls.signal),
        duration: elapsedMs,
      })
    } else {
      await runGenerationError(middleware, mwCtx, {
        error,
        duration: elapsedMs,
      })
    }
    logger.errors('generateLive activity failed', {
      error,
      source: 'generateLive',
    })
    throw error
  }
}

// ===========================
// Options Factory
// ===========================

/**
 * Create typed options for the generateLive() function without executing.
 */
export function createLiveOptions<
  TAdapter extends LiveAdapter<string, LiveProviderOptions<TAdapter>>,
  TStream extends boolean = false,
>(
  options: LiveActivityOptions<TAdapter, TStream>,
): LiveActivityOptions<TAdapter, TStream> {
  return options
}

// Re-export adapter types
export type { LiveAdapter, LiveAdapterConfig, AnyLiveAdapter } from './adapter'
export { BaseLiveAdapter } from './adapter'
