/**
 * Video Activity (Experimental)
 *
 * Generates videos from text prompts using a jobs/polling architecture.
 * This is a self-contained module with implementation, types, and JSDoc.
 *
 * @experimental Video generation is an experimental feature and may change.
 */

import { aiEventClient } from '@tanstack/ai-event-client'
import { toRunErrorPayload } from '../error-payload'
import { resolveDebugOption } from '../../logger/resolve'
import { assertPromptFileSourceSupport } from '../../utilities/content-source'
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
  toAbortError,
} from '../../utilities/activity-abort'
import type { InternalLogger } from '../../logger/internal-logger'
import type { DebugOption } from '../../logger/types'
import type {
  GenerationMiddleware,
  GenerationMiddlewareContext,
} from '../middleware/types'
import type { VideoAdapter } from './adapter'
import { normalizeStreamChunk } from '../../utilities/normalize-stream-chunk'
import type { AdapterYieldChunk } from '../../utilities/adapter-yield-chunk'
import type {
  MediaPrompt,
  MediaPromptFor,
  PersistedArtifactRef,
  StreamChunk,
  TokenUsage,
  VideoJobResult,
  VideoStatusResult,
  VideoUrlResult,
} from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'video' as const

// ===========================
// Type Extraction Helpers
// ===========================

/**
 * Extract provider options from a VideoAdapter via ~types.
 */
export type VideoProviderOptions<TAdapter> =
  TAdapter extends VideoAdapter<any, any, any, any, any, any>
    ? TAdapter['~types']['providerOptions']
    : object

/**
 * Extract the size type for a VideoAdapter's model via ~types.
 */
export type VideoSizeForAdapter<TAdapter> =
  TAdapter extends VideoAdapter<
    infer TModel,
    any,
    any,
    infer TSizeMap,
    any,
    any
  >
    ? TModel extends keyof TSizeMap
      ? TSizeMap[TModel]
      : string
    : string

/**
 * Extract the prompt type a model accepts from a VideoAdapter via ~types.
 * Mirrors `ImagePromptForModel`: models in the adapter's input-modality map
 * get a `prompt` narrowed to text + their supported part types; adapters
 * without a map fall back to the full MediaPrompt.
 */
export type VideoPromptForAdapter<TAdapter> =
  TAdapter extends VideoAdapter<
    infer TModel,
    any,
    any,
    any,
    infer ModsByName,
    any
  >
    ? string extends keyof ModsByName
      ? MediaPrompt
      : TModel extends keyof ModsByName
        ? MediaPromptFor<ModsByName[TModel][number]>
        : MediaPrompt
    : MediaPrompt

/**
 * Extract the duration type for a VideoAdapter's model via ~types.
 * Mirrors `VideoSizeForAdapter`. Falls back to `number` for adapters that
 * haven't declared per-model duration constraints.
 */
export type VideoDurationForAdapter<TAdapter> =
  TAdapter extends VideoAdapter<
    infer TModel,
    any,
    any,
    any,
    any,
    infer TDurationMap
  >
    ? TModel extends keyof TDurationMap
      ? TDurationMap[TModel]
      : number
    : number

// ===========================
// Activity Options Types

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
// ===========================

/**
 * Base options shared by all video activity operations.
 * The model is extracted from the adapter's model property.
 */
interface VideoActivityBaseOptions<
  TAdapter extends VideoAdapter<string, any, any, any, any, any>,
> {
  /** The video adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
}

/**
 * Options for creating a new video generation job.
 * The model is extracted from the adapter's model property.
 *
 * @template TAdapter - The video adapter type
 * @template TStream - Whether to stream the output
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type VideoCreateOptions<
  TAdapter extends VideoAdapter<string, any, any, any, any, any>,
  TStream extends boolean = false,
> = VideoActivityBaseOptions<TAdapter> & {
  /** Request type - create a new job (default if not specified) */
  request?: 'create'
  /**
   * Description of the desired video. Either a plain string, or — for models
   * that support image-conditioned generation — an ordered array of content
   * parts interleaving text with image inputs. Image parts may carry
   * `metadata.role` (`'start_frame' | 'end_frame' | 'reference' |
   * 'character'`) to disambiguate intent; positional fallback otherwise. The
   * accepted part types are narrowed per model via the adapter's
   * input-modality map.
   */
  prompt: VideoPromptForAdapter<TAdapter>
  /** Video size — format depends on the provider (e.g., "16:9", "1280x720") */
  size?: VideoSizeForAdapter<TAdapter>
  /**
   * Video duration in seconds. Adapters that declare a per-model duration
   * map narrow this to the model's valid union (e.g. `4 | 6 | 8` for Veo 3).
   * Pass `adapter.snapDuration(seconds)` to coerce raw seconds to a valid
   * value.
   */
  duration?: VideoDurationForAdapter<TAdapter>
  /**
   * Whether to stream the video generation lifecycle.
   * When true, returns an AsyncIterable<StreamChunk> that handles the full
   * job lifecycle: create job, poll for status, yield updates, and yield final result.
   * When false or not provided, returns a Promise<VideoJobResult>.
   *
   * @default false
   */
  stream?: TStream
  /** Polling interval in milliseconds (stream mode only). @default 2000 */
  pollingInterval?: number
  /** Maximum time to wait before timing out in milliseconds (stream mode only). @default 600000 */
  maxDuration?: number
  /**
   * Custom run id (stream mode only) — the id stamped on the emitted
   * `RUN_STARTED` / `RUN_FINISHED` chunks.
   *
   * IGNORED by a non-streaming submit. That run spans two calls, and its id is
   * derived from the provider's job instead, so {@link getVideoJobStatus} can
   * recompute it from the `jobId` you already have to poll with. Honoring a
   * custom id here would reintroduce the failure this avoids: a caller who set
   * it on the submit and forgot it on the poll would silently open a second
   * record while the first sat unfinished forever.
   */
  runId?: string
  /**
   * Stable conversation/thread id for correlating this run when persisted.
   *
   * Also the `threadId` stamped on the emitted `RUN_STARTED` / `RUN_FINISHED`
   * chunks; when omitted a throwaway id is minted for those chunks only, and
   * the persisted run record carries NO thread link rather than a fabricated
   * one. Pass it whenever persistence is on — it is the slot a reloading client
   * hydrates by, so a run stored without it can only be fetched by run id.
   */
  threadId?: string
  /**
   * Enable debug logging. Pass `true` to enable all categories, `false` to
   * silence everything including errors, or a `DebugConfig` object for granular
   * control and/or a custom `Logger`.
   */
  debug?: DebugOption
  /**
   * Observe-only middleware notified on start, usage, success, and error. Pass
   * `otelMiddleware()` to emit OpenTelemetry spans, `withGenerationPersistence()`
   * to persist the run, or implement the `GenerationMiddleware` contract for a
   * custom backend.
   *
   * In streaming mode one run covers the full create→poll→complete lifecycle:
   * `onStart` at submission, a terminal `onFinish`/`onError` when the job
   * settles, and `onAbort` if the consumer abandons the stream.
   *
   * In NON-streaming mode the call only SUBMITS the job, so it only opens the
   * run: no terminal hook fires here, because the video does not exist yet.
   * Pass the same `middleware` and `threadId` to {@link getVideoJobStatus}; the
   * poll that observes a terminal job state finishes the run and is where the
   * result and its artifacts are recorded. Nothing else has to be threaded
   * through — both calls derive the run id from the provider's `jobId`, the one
   * id a poller cannot be missing.
   *
   * Because the job id only exists once the provider accepts the job, `onStart`
   * fires AFTER the submit request rather than before it — an observer's span
   * therefore covers the run from acceptance onward, not the submit round-trip.
   * A submission that FAILS has no job to key on, so it opens and immediately
   * fails a run under this call's `requestId`: the thread's latest run reports
   * the failure (a client hydrating the slot sees it) even though there is no
   * job to resume.
   */
  middleware?: Array<GenerationMiddleware>
  /**
   * Maximum duration of this activity invocation in milliseconds.
   * No SDK-wide default — choose a value suitable for the provider and job.
   * Composed with {@link abortSignal}; the first abort wins.
   *
   * In stream mode this bounds the full create→poll→complete lifecycle and
   * complements {@link maxDuration} (which defaults to 10 minutes). When both
   * are set, the shorter limit wins via signal composition against the
   * polling deadline.
   */
  timeout?: number
  /**
   * Caller cancellation signal (request disconnects, job/runtime cancellation).
   * Composed with {@link timeout} into an effective signal forwarded to the
   * adapter on job submission. Request-specific — not stored on global
   * provider client config.
   */
  abortSignal?: AbortSignal
} & ({} extends VideoProviderOptions<TAdapter>
    ? {
        /** Provider-specific options for video generation */ modelOptions?: VideoProviderOptions<TAdapter>
      }
    : {
        /** Provider-specific options for video generation */ modelOptions: VideoProviderOptions<TAdapter>
      })

/**
 * Options for polling the status of a video generation job.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface VideoStatusOptions<
  TAdapter extends VideoAdapter<string, any, any, any, any, any>,
> extends VideoActivityBaseOptions<TAdapter> {
  /** Request type - get job status */
  request: 'status'
  /** The job ID to check status for */
  jobId: string
}

/**
 * Options for getting the URL of a completed video.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface VideoUrlOptions<
  TAdapter extends VideoAdapter<string, any, any, any, any, any>,
> extends VideoActivityBaseOptions<TAdapter> {
  /** Request type - get video URL */
  request: 'url'
  /** The job ID to get URL for */
  jobId: string
}

/**
 * Union type for all video activity options.
 * Discriminated by the `request` field.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type VideoActivityOptions<
  TAdapter extends VideoAdapter<string, any, any, any, any, any>,
  TRequest extends 'create' | 'status' | 'url' = 'create',
  TStream extends boolean = false,
> = TRequest extends 'status'
  ? VideoStatusOptions<TAdapter>
  : TRequest extends 'url'
    ? VideoUrlOptions<TAdapter>
    : VideoCreateOptions<TAdapter, TStream>

// ===========================
// Activity Result Types
// ===========================

/**
 * Result type for the video activity, based on request type and streaming.
 * - If stream is true (create request): AsyncIterable<StreamChunk>
 * - Otherwise: Promise<VideoJobResult | VideoStatusResult | VideoUrlResult>
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type VideoActivityResult<
  TRequest extends 'create' | 'status' | 'url' = 'create',
  TStream extends boolean = false,
> = TRequest extends 'status'
  ? Promise<VideoStatusResult>
  : TRequest extends 'url'
    ? Promise<VideoUrlResult>
    : TStream extends true
      ? AsyncIterable<StreamChunk>
      : Promise<VideoJobResult>

// ===========================
// Activity Implementation
// ===========================

/**
 * Generate video - creates a video generation job from a text prompt.
 *
 * Uses AI video generation models to create videos based on natural language descriptions.
 * Unlike image generation, video generation is asynchronous and requires polling for completion.
 *
 * When `stream: true` is passed, handles the full job lifecycle automatically:
 * create job → poll for status → stream updates → yield final result.
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * @example Create a video generation job
 * ```ts
 * import { generateVideo, getVideoJobStatus } from '@tanstack/ai'
 * import { openaiVideo } from '@tanstack/ai-openai'
 *
 * // Start a video generation job
 * const { jobId } = await generateVideo({
 *   adapter: openaiVideo('sora-2'),
 *   prompt: 'A cat chasing a dog in a sunny park'
 * })
 *
 * console.log('Job started:', jobId)
 *
 * // The submission only OPENS the run; the poll that sees a terminal state is
 * // what completes it. The `jobId` is the whole correlation — pass the same
 * // `middleware` and `threadId` when you use them.
 * const status = await getVideoJobStatus({
 *   adapter: openaiVideo('sora-2'),
 *   jobId,
 * })
 * ```
 *
 * @example Stream the full video generation lifecycle
 * ```ts
 * import { generateVideo, toServerSentEventsResponse } from '@tanstack/ai'
 * import { openaiVideo } from '@tanstack/ai-openai'
 *
 * const stream = generateVideo({
 *   adapter: openaiVideo('sora-2'),
 *   prompt: 'A cat chasing a dog in a sunny park',
 *   stream: true,
 *   pollingInterval: 3000,
 * })
 *
 * return toServerSentEventsResponse(stream)
 * ```
 */
export function generateVideo<
  TAdapter extends VideoAdapter<string, any, any, any, any, any>,
  TStream extends boolean = false,
>(
  options: VideoCreateOptions<TAdapter, TStream>,
): VideoActivityResult<'create', TStream> {
  if (options.stream) {
    return runStreamingVideoGeneration(
      options as VideoCreateOptions<TAdapter, true>,
    ) as VideoActivityResult<'create', TStream>
  }

  return runCreateVideoJob(options) as VideoActivityResult<'create', TStream>
}

/**
 * The run id a non-streaming video job is filed under, derived from the
 * provider job itself.
 *
 * A submit-and-poll run spans two calls in two different requests, so the two
 * halves need to agree on an id. Deriving it from the `jobId` — the one id a
 * poller structurally cannot be missing, because it cannot poll without it —
 * means no correlation state has to survive the boundary and there is no
 * "forgot to pass the run id" failure to document. The provider is part of the
 * key so two providers' job-id spaces cannot collide, and both halves are
 * percent-encoded so the joined string stays unambiguous (and url-safe, since
 * run ids end up in storage keys and query strings).
 */
function videoRunIdForJob(provider: string, jobId: string): string {
  return `video:${encodeURIComponent(provider)}:${encodeURIComponent(jobId)}`
}

/**
 * Internal implementation of non-streaming video job creation.
 *
 * Submitting a job OPENS a run, it does not complete one: the video does not
 * exist yet, and the bytes only appear on a later poll. So this fires `onStart`
 * and runs the result transforms over the submission result — the jobId lands
 * on the run record, which is what lets a later request resume polling — but
 * fires NO terminal hook. {@link getVideoJobStatus} finishes the run when the
 * job settles, keyed on the same derived id.
 *
 * `onStart` therefore runs AFTER the submit request: the run's id comes from
 * the job, which does not exist until the provider accepts it. A submission
 * that fails has no job, so it opens and immediately fails a run under this
 * call's `requestId` — terminal and unresumable by construction, but it puts
 * the failure where a client hydrating the thread will see it instead of
 * showing nothing.
 */
async function runCreateVideoJob<
  TAdapter extends VideoAdapter<string, any, any, any, any, any>,
>(options: VideoCreateOptions<TAdapter, boolean>): Promise<VideoJobResult> {
  const {
    adapter,
    prompt,
    size,
    duration,
    modelOptions,
    middleware,
    timeout,
    abortSignal: callerAbortSignal,
  } = options
  // Fail closed on `{ type: 'file' }` sources for adapters that haven't
  // declared support (see assertPromptFileSourceSupport).
  assertPromptFileSourceSupport(adapter, prompt)
  const model = adapter.model
  const requestId = createId('video')
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

  // `runId` is resolved per outcome (from the job, or absent on failure), so the
  // context is built once the outcome is known. `options.runId` is deliberately
  // not consulted: in non-streaming mode the run id is always the derived one,
  // the single rule that keeps the two calls in agreement.
  const contextFor = (runId?: string): GenerationMiddlewareContext =>
    createGenerationContext({
      requestId,
      activity: 'video',
      provider: adapter.name,
      model,
      modelOptions,
      // Deliberately the CALLER's `threadId` — no minted fallback. A thread id
      // nobody else knows would file the run in a slot no client could hydrate,
      // which is worse than no link because it looks like one. Mirrors the
      // streaming path.
      threadId: options.threadId,
      runId,
      artifactInputs: { prompt },
      createId,
    })

  logger.request(`activity=generateVideo provider=${providerName}`, {
    provider: providerName,
    model,
  })

  let jobResult: VideoJobResult
  try {
    jobResult = await raceWithAbort(
      adapter.createVideoJob({
        model,
        prompt,
        size,
        duration,
        modelOptions,
        logger,
        ...(abortControls.signal ? { abortSignal: abortControls.signal } : {}),
      }),
      abortControls.signal,
    )
    abortControls.clear()
  } catch (error) {
    abortControls.clear()
    // No jobId exists, so this run can only be keyed on the request. Start it
    // just to fail it: `generationRuns.update` on an unknown run id is a no-op
    // by contract, so without the `onStart` the failure would persist nowhere.
    const failedCtx = contextFor()
    await runGenerationStart(middleware, failedCtx)
    const elapsed = Date.now() - startTime
    if (isActivityAbortError(error, abortControls.signal)) {
      await runGenerationAbort(middleware, failedCtx, {
        reason: abortReasonMessage(error, abortControls.signal),
        duration: elapsed,
      })
    } else {
      await runGenerationError(middleware, failedCtx, {
        error,
        duration: elapsed,
      })
    }
    logger.errors('generateVideo activity failed', {
      error,
      source: 'generateVideo',
    })
    throw error
  }

  logger.output(`activity=generateVideo jobId=${jobResult.jobId}`, {
    jobId: jobResult.jobId,
    model: jobResult.model,
  })

  const mwCtx = contextFor(videoRunIdForJob(adapter.name, jobResult.jobId))
  await runGenerationStart(middleware, mwCtx)
  // Transforms see the submission result (no url yet, so nothing to copy into a
  // blob store) purely so the run record captures the jobId and any prompt
  // inputs. No finish hook: the run is still running.
  return await applyGenerationResultTransforms(mwCtx, jobResult)
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
  if (signal.aborted) {
    return Promise.reject(toAbortError(signal.reason))
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(toAbortError(signal.reason))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Internal streaming implementation for video generation.
 * Handles the full job lifecycle: create job → poll for status → stream updates → yield final result.
 */
async function* runStreamingVideoGeneration<
  TAdapter extends VideoAdapter<string, any, any, any, any, any>,
>(options: VideoCreateOptions<TAdapter, true>): AsyncIterable<StreamChunk> {
  const {
    adapter,
    prompt,
    size,
    duration,
    modelOptions,
    middleware,
    timeout,
    abortSignal: callerAbortSignal,
  } = options
  // Fail closed on `{ type: 'file' }` sources for adapters that haven't
  // declared support (see assertPromptFileSourceSupport).
  assertPromptFileSourceSupport(adapter, prompt)
  const model = adapter.model
  const runId = options.runId ?? createId('run')
  const requestId = createId('video')
  const obsStartTime = Date.now()
  const pollingInterval = options.pollingInterval ?? 2000
  const maxDuration = options.maxDuration ?? 600_000
  const logger: InternalLogger = resolveDebugOption(options.debug)
  const abortControls = createActivityAbortControls({
    timeout,
    abortSignal: callerAbortSignal,
  })
  const providerName =
    (adapter as { name?: string; provider?: string }).provider ??
    (adapter as { name?: string }).name ??
    'unknown'

  // The wire needs a thread id on every RUN_* chunk, so one is minted when the
  // caller passes none — matching `streamGenerationResult`, which the other
  // activities stream through.
  const wireThreadId = options.threadId ?? createId('thread')

  yield {
    type: 'RUN_STARTED',
    runId,
    threadId: wireThreadId,
    timestamp: Date.now(),
  } as StreamChunk

  const mwCtx = createGenerationContext({
    requestId,
    activity: 'video',
    provider: adapter.name,
    model,
    modelOptions,
    // Identity has to reach the middleware, not just the chunks: persistence
    // keys the run record on these, and without them it falls back to the
    // internal `requestId` and records no thread link at all.
    //
    // Deliberately the CALLER's `threadId`, never `wireThreadId`: a minted id is
    // known to nobody, so persisting it would file the run in a slot no client
    // could ever hydrate — worse than recording no link, because it looks like
    // one. This mirrors `generateImage`.
    threadId: options.threadId,
    runId,
    artifactInputs: { prompt },
    createId,
  })

  await runGenerationStart(middleware, mwCtx)

  logger.request(
    `activity=generateVideo provider=${providerName} stream=true`,
    {
      provider: providerName,
      model,
    },
  )

  // Tracks whether a terminal observer event (finish/error/abort) has already
  // fired, so the `finally` below can fire one on abandonment without
  // double-firing.
  let settled = false
  try {
    // Create the video generation job
    const jobResult = await raceWithAbort(
      adapter.createVideoJob({
        model,
        prompt,
        size,
        duration,
        modelOptions,
        logger,
        ...(abortControls.signal ? { abortSignal: abortControls.signal } : {}),
      }),
      abortControls.signal,
    )

    yield {
      type: 'CUSTOM',
      name: 'video:job:created',
      value: { jobId: jobResult.jobId },
      timestamp: Date.now(),
    }

    // Poll for completion
    const startTime = Date.now()
    while (Date.now() - startTime < maxDuration) {
      await sleep(pollingInterval, abortControls.signal)

      const statusResult = await adapter.getVideoStatus(jobResult.jobId)

      yield {
        type: 'CUSTOM',
        name: 'video:status',
        value: {
          jobId: jobResult.jobId,
          status: statusResult.status,
          progress: statusResult.progress,
          error: statusResult.error,
        },
        timestamp: Date.now(),
      }

      if (statusResult.status === 'completed') {
        const urlResult = await adapter.getVideoUrl(jobResult.jobId)

        logger.output(
          `activity=generateVideo jobId=${jobResult.jobId} status=completed`,
          {
            jobId: jobResult.jobId,
            url: urlResult.url,
          },
        )

        // Run the result transforms before anything observes the result, the
        // same as every other media activity. This is what lets persistence
        // copy the video into a blob store, attach its artifact refs, and
        // rewrite `url` to a durable app-origin one — so the chunk below and
        // the stored run record carry the SAME urls. Skipping it leaves a
        // result whose only url is the provider's expiring link.
        const rawResult = {
          jobId: jobResult.jobId,
          status: 'completed' as const,
          url: urlResult.url,
          expiresAt: urlResult.expiresAt,
          ...(urlResult.usage ? { usage: urlResult.usage } : {}),
        }
        const result = await applyGenerationResultTransforms(mwCtx, rawResult)

        // Fire finish before yielding the terminal chunks: the generation has
        // succeeded, so a consumer that stops reading after `generation:result`
        // (without pulling `RUN_FINISHED`) must not trip the abandonment path in
        // `finally`, which would otherwise report a spurious cancellation.
        if (urlResult.usage)
          await runGenerationUsage(middleware, mwCtx, urlResult.usage)
        await runGenerationFinish(middleware, mwCtx, {
          duration: Date.now() - obsStartTime,
          usage: urlResult.usage,
        })
        settled = true
        abortControls.clear()

        yield {
          type: 'CUSTOM',
          name: 'generation:result',
          value: result,
          timestamp: Date.now(),
        }

        yield* normalizeStreamChunk({
          type: 'RUN_FINISHED',
          runId,
          threadId: wireThreadId,
          finishReason: 'stop',
          timestamp: Date.now(),
        } as AdapterYieldChunk)
        return
      }

      if (statusResult.status === 'failed') {
        throw new Error(statusResult.error || 'Video generation failed')
      }
    }

    throw new Error('Video generation timed out')
  } catch (error: unknown) {
    abortControls.clear()
    const payload = toRunErrorPayload(error, 'Video generation failed')
    // Mark settled before firing terminal hooks: if a user error-hook throws,
    // the `finally` below must still not double-fire onAbort over the same op
    // (which would mask the original error and end the span twice).
    settled = true
    const elapsed = Date.now() - obsStartTime
    if (isActivityAbortError(error, abortControls.signal)) {
      await runGenerationAbort(middleware, mwCtx, {
        reason: abortReasonMessage(error, abortControls.signal),
        duration: elapsed,
      })
    } else {
      await runGenerationError(middleware, mwCtx, {
        error,
        duration: elapsed,
      })
    }
    logger.errors('generateVideo activity failed', {
      message: payload.message,
      code: payload.code,
      source: 'generateVideo',
    })
    yield* normalizeStreamChunk({
      type: 'RUN_ERROR',
      runId,
      threadId: wireThreadId,
      message: payload.message,
      ...(payload.code !== undefined ? { code: payload.code } : {}),
      timestamp: Date.now(),
    } as AdapterYieldChunk)
  } finally {
    abortControls.clear()
    if (!settled) {
      // The consumer abandoned the stream (broke the `for await` loop or
      // disconnected) before completion, so the generator is being unwound at
      // a `yield` without reaching finish/error. Fire `onAbort` — a cancel, not
      // an error — so otelMiddleware ends its span instead of leaking it.
      await runGenerationAbort(middleware, mwCtx, {
        reason: 'Video generation stream abandoned before completion',
        duration: Date.now() - obsStartTime,
      })
    }
  }
}

/**
 * Options for {@link getVideoJobStatus}.
 *
 * The run this poll finishes is identified by `adapter` + `jobId` alone — the
 * same pair the submitting `generateVideo()` call derived it from — so there is
 * no run id to thread through. Pass the submission's `threadId` and the same
 * `middleware`.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface VideoJobStatusOptions<
  TAdapter extends VideoAdapter<string, any, any, any, any, any>,
> {
  /** The video adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** The job ID to check status for */
  jobId: string
  /**
   * The scope the run is filed under. Must match the submission's `threadId` —
   * generation persistence REFUSES a run without a scope (a run filed under
   * none can never be hydrated by one), so omitting it throws rather than
   * quietly filing the finished video somewhere unreachable.
   */
  threadId?: string
  /**
   * Observe-only middleware. Hooks fire ONLY on the poll that observes a
   * terminal job state: `onStart` (resuming the submission's run), then the
   * result transforms — which is where persistence copies the video into a blob
   * store and rewrites `url` to a durable one, so the returned result carries
   * the same urls as the stored record — then `onFinish`, or `onError` when the
   * job failed. Intermediate polls invoke nothing, so a middleware is not
   * charged for the wait.
   */
  middleware?: Array<GenerationMiddleware>
}

/**
 * The status of a video job, plus the video itself once the job completed.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface VideoJobStatusResult {
  /** Job identifier */
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
  url?: string
  /** When the provider url expires, if it reported one. */
  expiresAt?: Date
  error?: string
  usage?: TokenUsage
  /** Durable artifact references, when generation persistence is wired. */
  artifacts?: Array<PersistedArtifactRef>
}

/**
 * Get video job status - returns the current status, progress, and URL if available.
 *
 * This function combines status checking and URL retrieval. If the job is completed,
 * it will automatically fetch and include the video URL.
 *
 * It is also where a non-streaming `generateVideo()` run ENDS: pass the same
 * `middleware` and `threadId`, and the poll that first sees a terminal job state
 * finishes the run (recording the result and its artifacts) or fails it. The run
 * is identified by `adapter` + `jobId`, exactly what the submission derived it
 * from, so there is nothing else to carry between the two calls.
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * @example Check job status
 * ```ts
 * import { getVideoJobStatus } from '@tanstack/ai'
 * import { openaiVideo } from '@tanstack/ai-openai'
 *
 * const result = await getVideoJobStatus({
 *   adapter: openaiVideo('sora-2'),
 *   jobId: 'job-123'
 * })
 *
 * console.log('Status:', result.status)
 * console.log('Progress:', result.progress)
 * if (result.url) {
 *   console.log('Video URL:', result.url)
 * }
 * ```
 *
 * @example Submit and poll one persisted run
 * ```ts
 * import { generateVideo, getVideoJobStatus } from '@tanstack/ai'
 * import { withGenerationPersistence } from '@tanstack/ai-persistence'
 * import { openaiVideo } from '@tanstack/ai-openai'
 *
 * const adapter = openaiVideo('sora-2')
 * const middleware = [withGenerationPersistence(persistence)]
 *
 * // Opens the run (status `running`, jobId recorded). Its run id is derived
 * // from the provider job, so nothing has to be stored to resume it.
 * const { jobId } = await generateVideo({
 *   adapter,
 *   prompt: 'A cat chasing a dog in a sunny park',
 *   threadId,
 *   middleware,
 * })
 *
 * // Completes the SAME run once the job settles — this is what writes the
 * // video, its artifacts, and the terminal status. Works from a different
 * // request or process: the jobId is the only correlation.
 * const status = await getVideoJobStatus({
 *   adapter,
 *   jobId,
 *   threadId,
 *   middleware,
 * })
 * ```
 */
export async function getVideoJobStatus<
  TAdapter extends VideoAdapter<string, any, any, any, any, any>,
>(options: VideoJobStatusOptions<TAdapter>): Promise<VideoJobStatusResult> {
  const { adapter, jobId, middleware } = options
  const requestId = createId('video-status')
  const startTime = Date.now()

  // Built per call but only USED on a terminal poll — `onStart` is what
  // registers the result transforms, so it has to run in the same call that
  // applies them.
  const terminalContext = (): GenerationMiddlewareContext =>
    createGenerationContext({
      requestId,
      activity: 'video',
      provider: adapter.name,
      model: adapter.model,
      threadId: options.threadId,
      // Recomputed, never passed in: the submitting call derived the same id
      // from the same provider + job, so the two halves agree without the
      // caller carrying anything but the jobId they must already have.
      runId: videoRunIdForJob(adapter.name, jobId),
      // Deliberately no `artifactInputs`: the submission already persisted any
      // prompt inputs under this run, and passing them again would store a
      // second copy of every input image.
      createId,
    })

  aiEventClient.emit('video:request:started', {
    requestId,
    provider: adapter.name,
    model: adapter.model,
    requestType: 'status',
    jobId,
    timestamp: startTime,
  })

  // Get status first
  const statusResult = await adapter.getVideoStatus(jobId)

  // If completed, also get the URL
  if (statusResult.status === 'completed') {
    let urlResult: VideoUrlResult
    // Scoped tightly to the provider call: a middleware hook that throws must
    // surface as itself, not be relabelled "failed to get video URL" and then
    // re-reported to the very middleware that threw.
    try {
      urlResult = await adapter.getVideoUrl(jobId)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to get video URL'
      aiEventClient.emit('video:request:completed', {
        requestId,
        provider: adapter.name,
        model: adapter.model,
        requestType: 'status',
        jobId,
        status: 'failed',
        progress: statusResult.progress,
        error: errorMessage,
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      })
      // Provider reported completed but result fetch failed — treat as failed,
      // and fail the run with it: the job is terminal, so nothing later will.
      await runGenerationError(middleware, terminalContext(), {
        error,
        duration: Date.now() - startTime,
      })
      return {
        jobId,
        status: 'failed' as const,
        progress: statusResult.progress,
        error: errorMessage,
      }
    }

    aiEventClient.emit('video:request:completed', {
      requestId,
      provider: adapter.name,
      model: adapter.model,
      requestType: 'status',
      jobId,
      status: statusResult.status,
      progress: statusResult.progress,
      url: urlResult.url,
      duration: Date.now() - startTime,
      timestamp: Date.now(),
    })
    if (urlResult.usage) {
      aiEventClient.emit('video:usage', {
        requestId,
        model: adapter.model,
        usage: urlResult.usage,
        timestamp: Date.now(),
      })
    }

    const mwCtx = terminalContext()
    await runGenerationStart(middleware, mwCtx)
    const result = await applyGenerationResultTransforms<VideoJobStatusResult>(
      mwCtx,
      {
        jobId,
        status: 'completed',
        ...(statusResult.progress !== undefined
          ? { progress: statusResult.progress }
          : {}),
        url: urlResult.url,
        ...(urlResult.expiresAt ? { expiresAt: urlResult.expiresAt } : {}),
        ...(urlResult.usage ? { usage: urlResult.usage } : {}),
      },
    )
    if (urlResult.usage)
      await runGenerationUsage(middleware, mwCtx, urlResult.usage)
    await runGenerationFinish(middleware, mwCtx, {
      duration: Date.now() - startTime,
      usage: urlResult.usage,
    })
    return result
  }

  aiEventClient.emit('video:request:completed', {
    requestId,
    provider: adapter.name,
    model: adapter.model,
    requestType: 'status',
    jobId,
    status: statusResult.status,
    progress: statusResult.progress,
    error: statusResult.error,
    duration: Date.now() - startTime,
    timestamp: Date.now(),
  })

  // A failed job is terminal for the run too: without this the record would sit
  // at `running` forever, indistinguishable from a job still being worked on.
  if (statusResult.status === 'failed') {
    await runGenerationError(middleware, terminalContext(), {
      error: new Error(statusResult.error || 'Video generation failed'),
      duration: Date.now() - startTime,
    })
  }

  // Return status for non-completed jobs
  return {
    jobId,
    status: statusResult.status,
    progress: statusResult.progress,
    error: statusResult.error,
  }
}

// ===========================
// Options Factory
// ===========================

/**
 * Create typed options for the generateVideo() function without executing.
 */
export function createVideoOptions<
  TAdapter extends VideoAdapter<string, any, any, any, any, any>,
  TStream extends boolean = false,
>(
  options: VideoCreateOptions<TAdapter, TStream>,
): VideoCreateOptions<TAdapter, TStream> {
  return options
}

// Re-export adapter types
export type {
  VideoAdapter,
  VideoAdapterConfig,
  AnyVideoAdapter,
} from './adapter'
export { BaseVideoAdapter } from './adapter'
