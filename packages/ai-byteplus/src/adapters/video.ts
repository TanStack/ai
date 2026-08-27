import { resolveMediaPrompt } from '@tanstack/ai'
import { BaseVideoAdapter, snapToDurationOption } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import {
  bytePlusArkError,
  bytePlusArkHeaders,
  bytePlusTimeoutSignal,
  getBytePlusArkApiKeyFromEnv,
  readJsonBody,
  toHeaderRecord,
  withBytePlusArkDefaults,
} from '../utils/client'
import {
  getBytePlusVideoDurationOptions,
  isKnownBytePlusVideoModel,
} from '../model-meta'
import {
  resolveBytePlusVideoResolution,
  resolveBytePlusVideoSize,
  supportsAudioOnlyReference,
  supportsLastFrame,
  supportsReferenceMedia,
} from '../video/video-provider-options'
import type { DurationOptions } from '@tanstack/ai/adapters'
import type {
  AudioPart,
  ImagePart,
  MediaInputMetadata,
  TokenUsage,
  VideoGenerationOptions,
  VideoJobResult,
  VideoPart,
  VideoStatusResult,
  VideoUrlResult,
} from '@tanstack/ai'
import type {
  BytePlusVideoContentPart,
  BytePlusVideoCreateRequest,
  BytePlusVideoCreateResponse,
  BytePlusVideoTask,
  BytePlusVideoTaskStatus,
  BytePlusVideoTaskUsage,
} from '../video/wire-types'
import type { BytePlusVideoProviderOptions } from '../video/video-provider-options'
import type {
  BytePlusVideoModelOrString,
  ResolveBytePlusVideoInputModalities,
  ResolveBytePlusVideoSize,
} from '../model-meta'
import type { BytePlusArkConfig } from '../utils/client'

/**
 * Configuration for the BytePlus Seedance video adapter.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface BytePlusVideoConfig extends BytePlusArkConfig {}

/** Path of the Seedance task API, relative to the Ark base URL. */
const /** Path of the Seedance task API, relative to the Ark base URL. */
  TASKS_PATH = '/contents/generations/tasks'

/**
 * `content.video_url` and `content.last_frame_url` are deleted 24 hours after
 * the task produces them.
 */
const VIDEO_URL_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Converts a media prompt part into the URL string Seedance's `content[]`
 * takes: public URLs pass through (BytePlus fetches them server-side), data
 * sources become base64 data URIs.
 */
function mediaPartToUrl(
  part:
    | ImagePart<MediaInputMetadata>
    | VideoPart<MediaInputMetadata>
    | AudioPart<MediaInputMetadata>,
): string {
  const { source } = part
  if (source.type === 'url') return source.value
  if (source.value.startsWith('data:')) return source.value
  return `data:${source.mimeType.toLowerCase()};base64,${source.value}`
}

interface BytePlusMediaCounts {
  firstFrames: number
  lastFrames: number
  visualReferences: number
  audioReferences: number
}

function appendBytePlusImageParts(
  content: Array<BytePlusVideoContentPart>,
  images: ReturnType<typeof resolveMediaPrompt>['images'],
  model: string,
  gated: boolean,
  counts: BytePlusMediaCounts,
): void {
  for (const part of images) {
    const role = part.metadata?.role
    switch (role) {
      case 'mask':
      case 'control':
        throw new Error(
          `byteplus: Seedance has no '${role}' image input on model ${model}. ` +
            `Use 'start_frame', 'end_frame' or 'reference'.`,
        )
      case 'end_frame': {
        if (gated && !supportsLastFrame(model)) {
          throw new Error(
            `byteplus: ${model} does not support a closing frame — it does ` +
              `text-to-video and first-frame image-to-video only. Drop the ` +
              `'end_frame' image or switch to a model with first-and-last-frame support.`,
          )
        }
        counts.lastFrames++
        content.push({
          type: 'image_url',
          image_url: { url: mediaPartToUrl(part) },
          role: 'last_frame',
        })
        break
      }
      case 'reference':
      case 'character': {
        if (gated && !supportsReferenceMedia(model)) {
          throw new Error(
            `byteplus: ${model} does not support reference images. Reference ` +
              `media is available on Seedance 2.5 and the 2.0 family; on this ` +
              `model use 'start_frame' / 'end_frame' images instead.`,
          )
        }
        counts.visualReferences++
        content.push({
          type: 'image_url',
          image_url: { url: mediaPartToUrl(part) },
          role: 'reference_image',
        })
        break
      }
      // An un-roled image is the opening frame, matching the API's own
      // default and the fal / Veo adapters' positional convention.
      case 'start_frame':
      case undefined: {
        counts.firstFrames++
        content.push({
          type: 'image_url',
          image_url: { url: mediaPartToUrl(part) },
          role: 'first_frame',
        })
        break
      }
    }
  }
}

function appendBytePlusVideoParts(
  content: Array<BytePlusVideoContentPart>,
  videos: ReturnType<typeof resolveMediaPrompt>['videos'],
  model: string,
  gated: boolean,
  counts: BytePlusMediaCounts,
): void {
  for (const part of videos) {
    if (gated && !supportsReferenceMedia(model)) {
      throw new Error(
        `byteplus: ${model} does not accept video prompt parts. Reference ` +
          `video is available on Seedance 2.5 and the 2.0 family only.`,
      )
    }
    counts.visualReferences++
    content.push({
      type: 'video_url',
      video_url: { url: mediaPartToUrl(part) },
      role: 'reference_video',
    })
  }
}

function appendBytePlusAudioParts(
  content: Array<BytePlusVideoContentPart>,
  audios: ReturnType<typeof resolveMediaPrompt>['audios'],
  model: string,
  gated: boolean,
  counts: BytePlusMediaCounts,
): void {
  for (const part of audios) {
    if (gated && !supportsReferenceMedia(model)) {
      throw new Error(
        `byteplus: ${model} does not accept audio prompt parts. Reference ` +
          `audio is available on Seedance 2.5 and the 2.0 family only.`,
      )
    }
    counts.audioReferences++
    content.push({
      type: 'audio_url',
      audio_url: { url: mediaPartToUrl(part) },
      role: 'reference_audio',
    })
  }
}

function assertBytePlusModeRules(
  model: string,
  gated: boolean,
  counts: BytePlusMediaCounts,
): void {
  if (!gated) return
  const { firstFrames, lastFrames, visualReferences, audioReferences } = counts
  const mixesFramesAndReferences =
    firstFrames + lastFrames > 0 && visualReferences + audioReferences > 0
  if (mixesFramesAndReferences) {
    throw new Error(
      `byteplus: first/last frame inputs cannot be combined with reference ` +
        `media on model ${model}. Use either frame roles ('start_frame', ` +
        `'end_frame') or reference roles ('reference', 'character', video, ` +
        `audio) — not both.`,
    )
  }
  if (firstFrames > 1) {
    throw new Error(
      `byteplus: ${model} accepts at most one opening frame; received ` +
        `${firstFrames} un-roled or 'start_frame' images. Use metadata.role ` +
        `('end_frame', 'reference') to disambiguate the others.`,
    )
  }
  if (lastFrames > 1) {
    throw new Error(
      `byteplus: ${model} accepts at most one closing frame; received ` +
        `${lastFrames} 'end_frame' images.`,
    )
  }
  const closingWithoutOpening = lastFrames > 0 && firstFrames === 0
  if (closingWithoutOpening) {
    throw new Error(
      `byteplus: a closing frame needs an opening frame alongside it on ` +
        `model ${model}. Add a 'start_frame' image, or drop the 'end_frame' role.`,
    )
  }
  if (
    audioReferences > 0 &&
    visualReferences === 0 &&
    !supportsAudioOnlyReference(model)
  ) {
    throw new Error(
      `byteplus: a reference audio input cannot be the only reference on ` +
        `model ${model}. Pair it with a reference image or video, or use ` +
        `Seedance 2.5 which accepts audio-only reference input.`,
    )
  }
}

/** Coerces a usage count that the API types as a string but sends as a number. */
function toTokenCount(value: number | string | undefined): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

/**
 * Maps a finished task's usage onto `TokenUsage`.
 *
 * Seedance bills output only. The API documents input tokens as always 0 and
 * `total_tokens` as equal to `completion_tokens`, so `promptTokens` is 0 and
 * the completion count is the billed quantity (`usage.billed` with
 * `unit: 'tokens'`). The deprecated `unitsBilled` is still populated for
 * backward compatibility.
 */
function buildBytePlusVideoUsage(
  usage: BytePlusVideoTaskUsage | undefined,
): TokenUsage | undefined {
  if (!usage) return undefined

  const completionTokens = toTokenCount(usage.completion_tokens)
  const totalTokens = toTokenCount(usage.total_tokens)
  const missingTokenCounts =
    completionTokens === undefined && totalTokens === undefined
  if (missingTokenCounts) {
    return undefined
  }

  const completion = completionTokens ?? totalTokens ?? 0
  return {
    promptTokens: 0,
    completionTokens: completion,
    totalTokens: totalTokens ?? completion,
    billed: { quantity: completion, unit: 'tokens' },
    unitsBilled: completion,
  }
}

/**
 * Formats a terminal task's error detail for a status / failure message.
 *
 * Always returns a string. Core surfaces a failed job as
 * `throw new Error(statusResult.error || 'Video generation failed')`, so
 * returning `undefined` for a failure Ark reported without an `error` block
 * would hand the caller an unattributable error. The final fallback is a
 * snapshot of the identifying fields instead.
 */
function describeTaskFailure(task: BytePlusVideoTask): string {
  const { code, message } = task.error ?? {}
  if (code && message) return `${code}: ${message}`
  if (message) return message
  if (code) return code
  // `expired` and `cancelled` are terminal without an `error` block.
  if (task.status === 'expired') {
    return 'Task expired before it finished (execution_expires_after elapsed).'
  }
  if (task.status === 'cancelled') return 'Task was cancelled.'
  return (
    `Task reported status "${task.status ?? 'unknown'}" with no error detail ` +
    `(id=${task.id ?? 'unknown'}, model=${task.model ?? 'unknown'}).`
  )
}

/**
 * BytePlus Seedance video generation adapter.
 *
 * Drives Ark's asynchronous task API — `POST /contents/generations/tasks` to
 * submit, `GET /contents/generations/tasks/{id}` to poll and to read the
 * finished video URL. Core owns the polling loop; this adapter implements the
 * three primitives plus the duration metadata.
 *
 * Prompt parts map onto Seedance's `content[]` roles, which the API sorts into
 * mutually exclusive task types:
 *
 * - `'start_frame'` (or a single un-roled image) → `first_frame` — the frame
 *   the video opens on (`i2v`).
 * - `'end_frame'` → `last_frame` — the frame it closes on (`flf2v`); Seedance
 *   requires a `first_frame` alongside it, and
 *   `seedance-1-0-pro-fast-251015` does not support it at all.
 * - `'reference'` / `'character'` → `reference_image`, video parts →
 *   `reference_video`, audio parts → `reference_audio` — subject and style
 *   references the model draws on (`r2v`, Seedance 2.5 and 2.0 family).
 *   Seedance 2.5 also accepts audio-only reference input; 2.0 does not.
 *
 * Frame roles and reference roles cannot be combined in one request, so the
 * adapter rejects a mix up front rather than surfacing a raw 400.
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * @example
 * ```typescript
 * const adapter = byteplusVideo('seedance-1-0-pro-fast-251015')
 *
 * const { jobId } = await generateVideo({
 *   adapter,
 *   prompt: 'a guitar being played in a store',
 *   size: '16:9_720p',
 *   duration: 4,
 *   modelOptions: { service_tier: 'flex' },
 * })
 * ```
 */
export class BytePlusVideoAdapter<
  TModel extends BytePlusVideoModelOrString,
> extends BaseVideoAdapter<
  TModel,
  BytePlusVideoProviderOptions,
  Record<TModel, BytePlusVideoProviderOptions>,
  Record<TModel, ResolveBytePlusVideoSize<TModel>>,
  Record<TModel, ResolveBytePlusVideoInputModalities<TModel>>,
  Record<TModel, number>
> {
  readonly name = 'byteplus' as const

  /** Config with the Ark base URL resolved and its trailing slashes trimmed. */
  private readonly clientConfig: Omit<BytePlusVideoConfig, 'baseURL'> & {
    baseURL: string
  }

  constructor(config: BytePlusVideoConfig, model: TModel) {
    super({}, model)
    this.clientConfig = withBytePlusArkDefaults(config)
  }

  private async request(
    path: string,
    init?: Omit<RequestInit, 'headers'>,
  ): Promise<{ response: Response; body: unknown }> {
    const fetchImpl = this.clientConfig.fetch ?? fetch
    const signal = bytePlusTimeoutSignal(this.clientConfig.timeout)
    const response = await fetchImpl(`${this.clientConfig.baseURL}${path}`, {
      ...init,
      ...(signal && { signal }),
      headers: bytePlusArkHeaders(
        this.clientConfig.apiKey,
        toHeaderRecord(this.clientConfig.defaultHeaders),
      ),
    })
    return { response, body: await readJsonBody(response) }
  }

  /**
   * Builds the `content[]` array from the resolved prompt, enforcing
   * Seedance's role vocabulary and mode exclusivity.
   */
  private buildContent(
    resolved: ReturnType<typeof resolveMediaPrompt>,
  ): Array<BytePlusVideoContentPart> {
    const model = this.model
    const content: Array<BytePlusVideoContentPart> = []
    if (resolved.text) content.push({ type: 'text', text: resolved.text })

    const gated = isKnownBytePlusVideoModel(model)
    const counts = {
      firstFrames: 0,
      lastFrames: 0,
      visualReferences: 0,
      audioReferences: 0,
    }
    appendBytePlusImageParts(content, resolved.images, model, gated, counts)
    appendBytePlusVideoParts(content, resolved.videos, model, gated, counts)
    appendBytePlusAudioParts(content, resolved.audios, model, gated, counts)
    assertBytePlusModeRules(model, gated, counts)

    if (content.length === 0) {
      throw new Error(
        `byteplus: a video prompt must carry text or at least one media input ` +
          `(model: ${model}).`,
      )
    }

    return content
  }

  async createVideoJob(
    options: VideoGenerationOptions<
      BytePlusVideoProviderOptions,
      ResolveBytePlusVideoSize<TModel>,
      number
    >,
  ): Promise<VideoJobResult> {
    const { size, modelOptions, logger } = options
    const model = this.model

    const content = this.buildContent(resolveMediaPrompt(options.prompt))

    // The generic `size` carries a "ratio_resolution" template and splits back
    // into Seedance's separate fields. Explicit modelOptions win below.
    const parsedSize =
      size !== undefined ? resolveBytePlusVideoSize(model, size) : undefined

    const duration =
      options.duration !== undefined
        ? isKnownBytePlusVideoModel(model)
          ? this.snapDuration(options.duration)
          : options.duration
        : undefined

    const request: BytePlusVideoCreateRequest = {
      ...(parsedSize && {
        ratio: parsedSize.ratio,
        ...(parsedSize.resolution !== undefined && {
          resolution: parsedSize.resolution,
        }),
      }),
      ...(duration !== undefined && { duration }),
      // Explicit provider options win over everything derived above.
      ...modelOptions,
      model,
      content,
    }

    if (request.resolution !== undefined) {
      request.resolution = resolveBytePlusVideoResolution(
        model,
        request.resolution,
      )
    }

    try {
      logger.request(
        `activity=video.create provider=${this.name} model=${model} size=${size ?? 'default'} duration=${request.duration ?? 'default'}`,
        { provider: this.name, model },
      )

      const { response, body } = await this.request(TASKS_PATH, {
        method: 'POST',
        body: JSON.stringify(request),
      })
      if (!response.ok) {
        throw bytePlusArkError(response.status, body, 'video task creation')
      }

      const { id } = (body ?? {}) as BytePlusVideoCreateResponse
      if (!id) {
        throw new Error('byteplus: video task creation returned no task id.')
      }

      return { jobId: id, model }
    } catch (error: unknown) {
      logger.errors(`${this.name}.createVideoJob fatal`, {
        error: toRunErrorPayload(error, `${this.name}.createVideoJob failed`),
        source: `${this.name}.createVideoJob`,
      })
      throw error
    }
  }

  /**
   * Fetches a task, tagging the thrown error with the HTTP status.
   *
   * The 200 body is validated rather than cast. `readJsonBody` returns
   * `undefined` for an empty body and the raw text for a non-JSON one — both
   * documented failure modes of these hosts (an HTML error page from a proxy
   * in front of the API). Casting either to `BytePlusVideoTask` yields a task
   * whose `status` is `undefined`, which {@link mapStatus} would have to
   * interpret; the honest answer is that the response was not a task at all,
   * so say so while the body is still in hand.
   */
  private async retrieveTask(jobId: string): Promise<BytePlusVideoTask> {
    const { response, body } = await this.request(
      `${TASKS_PATH}/${encodeURIComponent(jobId)}`,
    )
    if (!response.ok) {
      const error = bytePlusArkError(response.status, body, 'video task lookup')
      ;(error as { status?: number }).status = response.status
      throw error
    }
    if (typeof body !== 'object' || body === null) {
      throw bytePlusArkError(
        response.status,
        body,
        `video task lookup (job ${jobId}) returned a non-object body`,
      )
    }
    return body as BytePlusVideoTask
  }

  async getVideoStatus(jobId: string): Promise<VideoStatusResult> {
    let task: BytePlusVideoTask
    try {
      task = await this.retrieveTask(jobId)
    } catch (error) {
      if ((error as { status?: number }).status === 404) {
        return {
          jobId,
          status: 'failed',
          error: `Job not found: ${jobId} (${(error as Error).message})`,
        }
      }
      throw error
    }

    const status = this.mapStatus(task.status)
    const failure = status === 'failed' ? describeTaskFailure(task) : undefined
    return {
      jobId,
      status,
      ...(failure !== undefined && { error: failure }),
    }
  }

  async getVideoUrl(jobId: string): Promise<VideoUrlResult> {
    let task: BytePlusVideoTask
    try {
      task = await this.retrieveTask(jobId)
    } catch (error) {
      // See getVideoStatus: Ark's detail distinguishes an expired id from a
      // misrouted request.
      if ((error as { status?: number }).status === 404) {
        throw new Error(
          `Video job not found: ${jobId} (${(error as Error).message})`,
        )
      }
      throw error
    }

    const status = this.mapStatus(task.status)
    if (status === 'failed') {
      throw new Error(
        `Video generation failed: ${describeTaskFailure(task)}. Job ID: ${jobId}`,
      )
    }

    const url = task.content?.video_url
    if (!url) {
      throw new Error(
        `Video is not ready for download. Check status first. Job ID: ${jobId}`,
      )
    }

    const anchorSeconds = task.updated_at ?? task.created_at
    const expiresAt =
      anchorSeconds !== undefined
        ? new Date(anchorSeconds * 1000 + VIDEO_URL_TTL_MS)
        : undefined

    const usage = buildBytePlusVideoUsage(task.usage)
    return {
      jobId,
      url,
      ...(expiresAt && { expiresAt }),
      ...(usage && { usage }),
    }
  }

  /**
   * Maps Seedance task states onto the generic video status set. `expired`
   * (the task outlived `execution_expires_after`) and `cancelled` are
   * terminal non-successes, so both report as failed.
   *
   * An unrecognized state throws rather than defaulting to `processing`.
   * Core's poll loop treats `processing` as "keep waiting", so mapping an
   * unknown state — a missing `status`, or a terminal one Ark adds later such
   * as `rejected` — onto it means polling until `maxDuration` and then
   * reporting a generic timeout, with the state Ark actually sent never
   * reaching the caller. Failing here names it.
   */
  protected mapStatus(
    apiStatus: BytePlusVideoTaskStatus | string | undefined,
  ): VideoStatusResult['status'] {
    switch (apiStatus) {
      case 'queued':
        return 'pending'
      case 'running':
        return 'processing'
      case 'succeeded':
        return 'completed'
      case 'failed':
      case 'expired':
      case 'cancelled':
        return 'failed'
      case undefined:
      default:
        throw new Error(
          `byteplus: unrecognized Seedance task status ` +
            `${apiStatus === undefined ? '(missing)' : `"${apiStatus}"`}. ` +
            `Known states: queued, running, succeeded, failed, expired, cancelled.`,
        )
    }
  }

  /**
   * Seedance accepts any whole second inside a per-model range: 4–15s on the
   * 2.0 family, 4–12s on 1.5-pro, 2–12s on the 1.0 models. An unknown model
   * reports the union of those ranges as a UI hint — see
   * `BYTEPLUS_VIDEO_FALLBACK_DURATIONS`, which `createVideoJob` does not snap
   * against.
   */
  override availableDurations(): DurationOptions<number> {
    return getBytePlusVideoDurationOptions(this.model)
  }

  /**
   * Coerce a raw seconds value to the closest duration this model accepts
   * (clamped to its range and rounded to whole seconds).
   */
  override snapDuration(seconds: number): number | undefined {
    return snapToDurationOption(seconds, this.availableDurations())
  }
}

/**
 * Creates a BytePlus Seedance video adapter with an explicit API key.
 * Type resolution happens here at the call site.
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * @param model - The model name (e.g., 'seedance-1-0-pro-fast-251015')
 * @param apiKey - Your BytePlus Ark API key
 * @param config - Optional additional configuration
 * @returns Configured BytePlus video adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createBytePlusVideo('seedance-1-5-pro-251215', 'ark-...')
 *
 * const { jobId } = await generateVideo({
 *   adapter,
 *   prompt: 'a guitar being played in a store',
 *   size: '16:9_1080p',
 *   duration: 5,
 * })
 * ```
 */
export function createBytePlusVideo<TModel extends BytePlusVideoModelOrString>(
  model: TModel,
  apiKey: string,
  config?: Omit<BytePlusVideoConfig, 'apiKey'>,
): BytePlusVideoAdapter<TModel> {
  return new BytePlusVideoAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a BytePlus Seedance video adapter, reading `ARK_API_KEY` from the
 * environment. Type resolution happens here at the call site.
 *
 * Note that Ark keys are region-isolated and Seedance is only served from the
 * Asia-Pacific endpoint — an EU key will not work here.
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * @param model - The model name (e.g., 'dreamina-seedance-2-0-260128')
 * @param config - Optional configuration (excluding apiKey, auto-detected)
 * @returns Configured BytePlus video adapter instance with resolved types
 * @throws Error if ARK_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * const adapter = byteplusVideo('dreamina-seedance-2-0-260128')
 *
 * // Image-to-video: an un-roled image is the opening frame.
 * const { jobId } = await generateVideo({
 *   adapter,
 *   prompt: [
 *     { type: 'text', content: 'the guitarist starts playing' },
 *     { type: 'image', source: { type: 'url', value: 'https://example.com/shop.jpg' } },
 *   ],
 * })
 *
 * const status = await getVideoJobStatus({ adapter, jobId })
 * ```
 *
 * ## Models this package does not know yet
 *
 * `model` also accepts any string, so a Seedance id BytePlus publishes after
 * this release works without upgrading. **Seedance 2.5 is the case this exists
 * for**: `dreamina-seedance-2-5-260628` is real and reachable, but its
 * capability cells could not be probed from this repo's account (Ark answers
 * 404 `ModelNotOpen` until the model is activated in the Ark Console), so it
 * is deliberately absent from the narrowed model tables. Passing it here works
 * for an account that has activated it.
 *
 * An unknown id relaxes both halves of the adapter: the `size` type widens to
 * any string, provider options are ungated, and the runtime guards that encode
 * per-model capabilities — resolution tiers, closing-frame and reference-media
 * support, frame cardinality and mode exclusivity, duration snapping — stand
 * down so Ark decides. Known ids are unaffected. See
 * {@link BytePlusVideoModelOrString} for how to discover and probe an id.
 *
 * @example
 * ```typescript
 * // Seedance 2.5, before this package ships probe-verified metadata for it:
 * const adapter = byteplusVideo('dreamina-seedance-2-5-260628')
 * ```
 */
export function byteplusVideo<TModel extends BytePlusVideoModelOrString>(
  model: TModel,
  config?: Omit<BytePlusVideoConfig, 'apiKey'>,
): BytePlusVideoAdapter<TModel> {
  const apiKey = getBytePlusArkApiKeyFromEnv()
  return createBytePlusVideo(model, apiKey, config)
}
