/**
 * Voice Activity
 *
 * Creates a reusable voice — either designed from a text description or cloned
 * from reference audio — and returns voice ids that `generateSpeech()` accepts.
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
import type { VoiceAdapter } from './adapter'
import type {
  StreamChunk,
  VoiceGenerationOptions,
  VoiceResult,
  VoiceStatusResult,
} from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'voice' as const

// ===========================
// Type Extraction Helpers
// ===========================

/**
 * Extract provider options from a VoiceAdapter via ~types.
 */
export type VoiceProviderOptions<TAdapter> = TAdapter extends {
  '~types': { providerOptions: infer P extends object }
}
  ? P
  : object

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the voice activity.
 * The model is extracted from the adapter's model property.
 *
 * @template TAdapter - The voice adapter type
 * @template TStream - Whether to stream the output
 */
export interface VoiceActivityOptions<
  TAdapter extends VoiceAdapter<string, VoiceProviderOptions<TAdapter>>,
  TStream extends boolean = false,
> {
  /** The voice adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /**
   * Text description of the voice to create, for design-capable models
   * (e.g. `'A warm, gravelly narrator in his sixties'`).
   */
  prompt?: string
  /**
   * Reference audio of the speaker to clone, for clone-capable models.
   * Accepts a base64 string, data URL, https URL, File, Blob, or ArrayBuffer.
   */
  referenceAudio?: string | File | Blob | ArrayBuffer
  /**
   * Name to store the voice under in the provider's voice library. Check
   * `saved` on each returned voice to see whether it was actually persisted.
   */
  name?: string
  /** Human-readable description stored alongside the voice */
  description?: string
  /** Provider-specific options for voice creation */
  modelOptions?: VoiceProviderOptions<TAdapter>
  /**
   * Whether to stream the generation result.
   * When true, returns an AsyncIterable<StreamChunk> for streaming transport.
   * When false or not provided, returns a Promise<VoiceResult>.
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
 * Result type for the voice activity.
 * - If stream is true: AsyncIterable<StreamChunk>
 * - Otherwise: Promise<VoiceResult>
 */
export type VoiceActivityResult<TStream extends boolean = false> =
  TStream extends true ? AsyncIterable<StreamChunk> : Promise<VoiceResult>

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ===========================
// Activity Implementation
// ===========================

/**
 * Voice activity - creates a reusable voice.
 *
 * Providers create voices in one of two ways, and some support both: design a
 * new voice from a text description, or clone one from reference audio. Either
 * way the result carries voice ids you pass back to `generateSpeech()`.
 *
 * @example Design a voice from a description
 * ```ts
 * import { generateVoice, generateSpeech } from '@tanstack/ai'
 * import { elevenlabsVoiceDesign, elevenlabsSpeech } from '@tanstack/ai-elevenlabs'
 *
 * const designed = await generateVoice({
 *   adapter: elevenlabsVoiceDesign('eleven_ttv_v3'),
 *   prompt: 'A warm, gravelly narrator in his sixties with a slight Irish lilt',
 * })
 *
 * const [preview] = designed.voices
 * if (!preview) throw new Error('No voice candidates returned')
 *
 * const speech = await generateSpeech({
 *   adapter: elevenlabsSpeech('eleven_v3'),
 *   text: 'Once upon a time...',
 *   voice: preview.voiceId,
 * })
 * ```
 *
 * @example Save the voice to the provider's library
 * ```ts
 * const saved = await generateVoice({
 *   adapter: elevenlabsVoiceDesign('eleven_ttv_v3'),
 *   prompt: 'A bright, upbeat product demo host',
 *   name: 'Demo Host',
 *   description: 'Bright, upbeat, mid-30s',
 * })
 * ```
 */
export function generateVoice<
  TAdapter extends VoiceAdapter<string, VoiceProviderOptions<TAdapter>>,
  TStream extends boolean = false,
>(
  options: VoiceActivityOptions<TAdapter, TStream>,
): VoiceActivityResult<TStream> {
  if (options.stream) {
    return streamGenerationResult(
      // Only `runId` is taken from the resolved wire identity — see the
      // matching note in `generateSpeech`.
      (resolved) => runGenerateVoice({ ...options, runId: resolved.runId }),
      options,
    ) as VoiceActivityResult<TStream>
  }
  return runGenerateVoice(options) as VoiceActivityResult<TStream>
}

/**
 * Run the core voice generation logic (non-streaming).
 */
async function runGenerateVoice<
  TAdapter extends VoiceAdapter<string, VoiceProviderOptions<TAdapter>>,
>(options: VoiceActivityOptions<TAdapter, boolean>): Promise<VoiceResult> {
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

  if (rest.prompt == null && rest.referenceAudio == null) {
    throw new Error(
      'generateVoice() requires `prompt` (design a new voice) or `referenceAudio` (clone an existing one).',
    )
  }

  const model = adapter.model
  const requestId = createId('voice')
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
    activity: 'voice',
    provider: adapter.name,
    model,
    modelOptions: rest.modelOptions,
    artifactInputs: {
      prompt: rest.prompt,
      name: rest.name,
      description: rest.description,
    },
    threadId,
    runId,
    createId,
  })

  await runGenerationStart(middleware, mwCtx)

  aiEventClient.emit('voice:request:started', {
    requestId,
    provider: adapter.name,
    model,
    requestType: 'create',
    prompt: rest.prompt,
    name: rest.name,
    description: rest.description,
    hasReferenceAudio: rest.referenceAudio != null,
    modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
    timestamp: startTime,
  })

  logger.request(`activity=generateVoice provider=${providerName}`, {
    provider: providerName,
    model,
  })

  try {
    const rawResult = await raceWithAbort(
      adapter.generateVoice({
        ...(rest as Omit<
          VoiceGenerationOptions<VoiceProviderOptions<TAdapter>>,
          'model' | 'logger' | 'abortSignal'
        >),
        model,
        logger,
        ...(abortControls.signal ? { abortSignal: abortControls.signal } : {}),
      }),
      abortControls.signal,
    )
    abortControls.clear()
    const result = await applyGenerationResultTransforms(mwCtx, rawResult)
    const duration = Date.now() - startTime

    aiEventClient.emit('voice:request:completed', {
      requestId,
      provider: adapter.name,
      model,
      requestType: 'create',
      voiceIds: result.voices.map((voice) => voice.voiceId),
      voiceCount: result.voices.length,
      previewText: result.previewText,
      duration,
      modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
      timestamp: Date.now(),
    })

    if (result.usage) {
      aiEventClient.emit('voice:usage', {
        requestId,
        model,
        usage: result.usage,
        modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
        timestamp: Date.now(),
      })
    }

    logger.output(`activity=generateVoice voices=${result.voices.length}`, {
      voices: result.voices.length,
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
    const err = error as Error
    aiEventClient.emit('voice:request:error', {
      requestId,
      provider: adapter.name,
      model,
      requestType: 'create',
      error: { message: err.message, name: err.name },
      duration,
      modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
      timestamp: Date.now(),
    })
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
    logger.errors('generateVoice activity failed', {
      error,
      source: 'generateVoice',
    })
    throw error
  }
}

// ===========================
// Training Status
// ===========================

/**
 * Options for polling a voice's training state.
 */
export interface VoiceStatusOptions<
  TAdapter extends VoiceAdapter<string, VoiceProviderOptions<TAdapter>>,
> {
  /** The voice adapter that created the voice */
  adapter: TAdapter & { kind: typeof kind }
  /** The voice to poll, from `generateVoice()` */
  voiceId: string
  /** Enable debug logging. */
  debug?: DebugOption
  /** Stable conversation/thread id for correlating this run when persisted. */
  threadId?: string
}

/**
 * Poll the training state of a voice.
 *
 * Only providers that train asynchronously implement this. A voice that came
 * back from `generateVoice()` without `status: 'training'` is usable already,
 * and there is nothing to poll.
 *
 * @example Wait for an async clone to finish
 * ```ts
 * const created = await generateVoice({ adapter, referenceAudio })
 * const [voice] = created.voices
 * if (!voice) throw new Error('The provider returned no voices.')
 *
 * let state = voice.status ?? 'ready'
 * while (state === 'training') {
 *   await new Promise((resolve) => setTimeout(resolve, 5_000))
 *   const polled = await getVoiceStatus({ adapter, voiceId: voice.voiceId })
 *   state = polled.status
 * }
 *
 * if (state === 'failed') throw new Error('Voice training failed.')
 * ```
 */
export async function getVoiceStatus<
  TAdapter extends VoiceAdapter<string, VoiceProviderOptions<TAdapter>>,
>(options: VoiceStatusOptions<TAdapter>): Promise<VoiceStatusResult> {
  const { adapter, voiceId, threadId } = options
  const logger: InternalLogger = resolveDebugOption(options.debug)

  const poll = adapter.getVoiceStatus
  if (!poll) {
    throw new Error(
      `The ${adapter.name} voice adapter creates a voice in one call and has no training status to poll. Read \`status\` on the voices generateVoice() returned instead.`,
    )
  }

  const requestId = createId('voice-status')
  const startTime = Date.now()

  aiEventClient.emit('voice:request:started', {
    requestId,
    threadId,
    provider: adapter.name,
    model: adapter.model,
    requestType: 'status',
    voiceId,
    hasReferenceAudio: false,
    timestamp: startTime,
  })

  logger.request(`activity=getVoiceStatus provider=${adapter.name}`, {
    provider: adapter.name,
    model: adapter.model,
  })

  try {
    const result = await poll.call(adapter, voiceId)

    aiEventClient.emit('voice:request:completed', {
      requestId,
      threadId,
      provider: adapter.name,
      model: adapter.model,
      requestType: 'status',
      voiceIds: [result.voiceId],
      voiceCount: 1,
      trainingStatus: result.status,
      duration: Date.now() - startTime,
      timestamp: Date.now(),
    })

    return result
  } catch (error) {
    const err = error as Error
    aiEventClient.emit('voice:request:error', {
      requestId,
      threadId,
      provider: adapter.name,
      model: adapter.model,
      requestType: 'status',
      error: { message: err.message, name: err.name },
      duration: Date.now() - startTime,
      timestamp: Date.now(),
    })
    logger.errors('getVoiceStatus failed', { error, source: 'getVoiceStatus' })
    throw error
  }
}

// ===========================
// Options Factory
// ===========================

/**
 * Create typed options for the generateVoice() function without executing.
 */
export function createVoiceOptions<
  TAdapter extends VoiceAdapter<string, VoiceProviderOptions<TAdapter>>,
  TStream extends boolean = false,
>(
  options: VoiceActivityOptions<TAdapter, TStream>,
): VoiceActivityOptions<TAdapter, TStream> {
  return options
}

// Re-export adapter types
export type {
  VoiceAdapter,
  VoiceAdapterConfig,
  AnyVoiceAdapter,
} from './adapter'
export { BaseVoiceAdapter } from './adapter'
