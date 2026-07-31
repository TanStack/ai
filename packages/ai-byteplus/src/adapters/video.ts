import { resolveMediaPrompt } from '@tanstack/ai'
import { BaseVideoAdapter, snapToDurationOption } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import {
  bytePlusArkError,
  bytePlusArkHeaders,
  getBytePlusArkApiKeyFromEnv,
  readJsonBody,
  toHeaderRecord,
  withBytePlusArkDefaults,
} from '../utils/client'
import { getBytePlusVideoDurationOptions } from '../model-meta'
import {
  resolveBytePlusVideoSize,
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
import type {
  BytePlusVideoModelProviderOptionsByName,
  BytePlusVideoProviderOptions,
} from '../video/video-provider-options'
import type {
  BytePlusVideoModel,
  BytePlusVideoModelDurationByName,
  BytePlusVideoModelInputModalitiesByName,
  BytePlusVideoModelSizeByName,
} from '../model-meta'
import type { BytePlusArkConfig } from '../utils/client'

/**
 * Configuration for the BytePlus Seedance video adapter.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface BytePlusVideoConfig extends BytePlusArkConfig {}

/** Path of the Seedance task API, relative to the Ark base URL. */
const TASKS_PATH = '/contents/generations/tasks'

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
 * Seedance bills output only — the API documents input tokens as always 0 and
 * `total_tokens` as equal to `completion_tokens` — so `promptTokens` is 0 and
 * the completion count doubles as `unitsBilled`.
 */
function buildBytePlusVideoUsage(
  usage: BytePlusVideoTaskUsage | undefined,
): TokenUsage | undefined {
  if (!usage) return undefined

  const completionTokens = toTokenCount(usage.completion_tokens)
  const totalTokens = toTokenCount(usage.total_tokens)
  if (completionTokens === undefined && totalTokens === undefined) {
    return undefined
  }

  const completion = completionTokens ?? totalTokens ?? 0
  return {
    promptTokens: 0,
    completionTokens: completion,
    totalTokens: totalTokens ?? completion,
    unitsBilled: completion,
  }
}

/** Formats a terminal task's error detail for a status / failure message. */
function describeTaskFailure(task: BytePlusVideoTask): string | undefined {
  const { code, message } = task.error ?? {}
  if (code && message) return `${code}: ${message}`
  if (message) return message
  if (code) return code
  // `expired` and `cancelled` are terminal without an `error` block.
  if (task.status === 'expired') {
    return 'Task expired before it finished (execution_expires_after elapsed).'
  }
  if (task.status === 'cancelled') return 'Task was cancelled.'
  return undefined
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
 *   references the model draws on (`r2v`, Seedance 2.0 family only).
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
  TModel extends BytePlusVideoModel,
> extends BaseVideoAdapter<
  TModel,
  BytePlusVideoProviderOptions,
  BytePlusVideoModelProviderOptionsByName,
  BytePlusVideoModelSizeByName,
  BytePlusVideoModelInputModalitiesByName,
  BytePlusVideoModelDurationByName
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
    const response = await fetchImpl(`${this.clientConfig.baseURL}${path}`, {
      ...init,
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

    let firstFrames = 0
    let lastFrames = 0
    // Audio counts as a reference for the mode-exclusivity check but not for
    // the "audio can't be the only reference" rule, which wants a visual.
    let visualReferences = 0
    let audioReferences = 0

    for (const part of resolved.images) {
      const role = part.metadata?.role
      switch (role) {
        case 'mask':
        case 'control':
          throw new Error(
            `byteplus: Seedance has no '${role}' image input on model ${model}. ` +
              `Use 'start_frame', 'end_frame' or 'reference'.`,
          )
        case 'end_frame': {
          if (!supportsLastFrame(model)) {
            throw new Error(
              `byteplus: ${model} does not support a closing frame — it does ` +
                `text-to-video and first-frame image-to-video only. Drop the ` +
                `'end_frame' image or switch to a model with first-and-last-frame support.`,
            )
          }
          lastFrames++
          content.push({
            type: 'image_url',
            image_url: { url: mediaPartToUrl(part) },
            role: 'last_frame',
          })
          break
        }
        case 'reference':
        case 'character': {
          if (!supportsReferenceMedia(model)) {
            throw new Error(
              `byteplus: ${model} does not support reference images. Reference ` +
                `media is available on the Seedance 2.0 family; on this model use ` +
                `'start_frame' / 'end_frame' images instead.`,
            )
          }
          visualReferences++
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
          firstFrames++
          content.push({
            type: 'image_url',
            image_url: { url: mediaPartToUrl(part) },
            role: 'first_frame',
          })
          break
        }
      }
    }

    // Video and audio parts only exist in reference mode: Seedance rejects an
    // un-roled video with "reference media mode requires video role to be
    // reference_video", and has no frame-style role for either modality.
    for (const part of resolved.videos) {
      if (!supportsReferenceMedia(model)) {
        throw new Error(
          `byteplus: ${model} does not accept video prompt parts. Reference ` +
            `video is available on the Seedance 2.0 family only.`,
        )
      }
      visualReferences++
      content.push({
        type: 'video_url',
        video_url: { url: mediaPartToUrl(part) },
        role: 'reference_video',
      })
    }

    for (const part of resolved.audios) {
      if (!supportsReferenceMedia(model)) {
        throw new Error(
          `byteplus: ${model} does not accept audio prompt parts. Reference ` +
            `audio is available on the Seedance 2.0 family only.`,
        )
      }
      audioReferences++
      content.push({
        type: 'audio_url',
        audio_url: { url: mediaPartToUrl(part) },
        role: 'reference_audio',
      })
    }

    const frames = firstFrames + lastFrames
    if (frames > 0 && visualReferences + audioReferences > 0) {
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

    // Seedance treats a closing frame as the second half of first-and-last-
    // frame mode: on its own it fails with "last frame image content cannot be
    // mixed with first frame or reference image content".
    if (lastFrames > 0 && firstFrames === 0) {
      throw new Error(
        `byteplus: a closing frame needs an opening frame alongside it on ` +
          `model ${model}. Add a 'start_frame' image, or drop the 'end_frame' role.`,
      )
    }

    if (audioReferences > 0 && visualReferences === 0) {
      throw new Error(
        `byteplus: a reference audio input cannot be the only reference on ` +
          `model ${model}. Pair it with a reference image or video.`,
      )
    }

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
      BytePlusVideoModelSizeByName[TModel],
      BytePlusVideoModelDurationByName[TModel]
    >,
  ): Promise<VideoJobResult> {
    const { size, modelOptions, logger } = options
    const model = this.model

    const content = this.buildContent(resolveMediaPrompt(options.prompt))

    // The generic `size` carries a "ratio_resolution" template and splits back
    // into Seedance's separate fields. Explicit modelOptions win below.
    const parsedSize =
      size !== undefined ? resolveBytePlusVideoSize(model, size) : undefined

    // Coerce the requested duration into the model's range rather than letting
    // the API reject it. `modelOptions.duration` is deliberately not snapped:
    // it is the escape hatch for `-1` (model picks the length).
    const duration =
      options.duration !== undefined
        ? this.snapDuration(options.duration)
        : undefined

    const request: BytePlusVideoCreateRequest = {
      ...(parsedSize && {
        ratio: parsedSize.ratio,
        ...(parsedSize.resolution !== undefined && {
          resolution: parsedSize.resolution.toLowerCase(),
        }),
      }),
      ...(duration !== undefined && { duration }),
      // Explicit provider options win over everything derived above.
      ...modelOptions,
      model,
      content,
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

  /** Fetches a task, tagging the thrown error with the HTTP status. */
  private async retrieveTask(jobId: string): Promise<BytePlusVideoTask> {
    const { response, body } = await this.request(
      `${TASKS_PATH}/${encodeURIComponent(jobId)}`,
    )
    if (!response.ok) {
      const error = bytePlusArkError(response.status, body, 'video task lookup')
      ;(error as { status?: number }).status = response.status
      throw error
    }
    return (body ?? {}) as BytePlusVideoTask
  }

  async getVideoStatus(jobId: string): Promise<VideoStatusResult> {
    let task: BytePlusVideoTask
    try {
      task = await this.retrieveTask(jobId)
    } catch (error) {
      // A task record lives 7 days from creation; past that the id 404s.
      if ((error as { status?: number }).status === 404) {
        return { jobId, status: 'failed', error: 'Job not found' }
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
      if ((error as { status?: number }).status === 404) {
        throw new Error(`Video job not found: ${jobId}`)
      }
      throw error
    }

    const status = this.mapStatus(task.status)
    if (status === 'failed') {
      const failure = describeTaskFailure(task)
      throw new Error(
        `Video generation failed${failure ? `: ${failure}` : ''}. Job ID: ${jobId}`,
      )
    }

    const url = task.content?.video_url
    if (!url) {
      throw new Error(
        `Video is not ready for download. Check status first. Job ID: ${jobId}`,
      )
    }

    // The 24-hour window runs from when the output was produced, which is the
    // last status change on a succeeded task — `created_at` anchors the
    // separate 7-day retention of the task record itself, and can be far
    // earlier (a live `flex` task sat queued ~15 minutes). Corroborated by the
    // signed TOS link itself, which carries `X-Tos-Expires=86400` from an
    // `X-Tos-Date` matching `updated_at`. Fall back to `created_at` only when
    // `updated_at` is missing.
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
        return 'processing'
    }
  }

  /**
   * Seedance accepts any whole second inside a per-model range: 4–15s on the
   * 2.0 family, 4–12s on 1.5-pro, 2–12s on the 1.0 models.
   */
  override availableDurations(): DurationOptions<
    BytePlusVideoModelDurationByName[TModel]
  > {
    return getBytePlusVideoDurationOptions(this.model)
  }

  /**
   * Coerce a raw seconds value to the closest duration this model accepts
   * (clamped to its range and rounded to whole seconds).
   */
  override snapDuration(
    seconds: number,
  ): BytePlusVideoModelDurationByName[TModel] | undefined {
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
export function createBytePlusVideo<TModel extends BytePlusVideoModel>(
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
 */
export function byteplusVideo<TModel extends BytePlusVideoModel>(
  model: TModel,
  config?: Omit<BytePlusVideoConfig, 'apiKey'>,
): BytePlusVideoAdapter<TModel> {
  const apiKey = getBytePlusArkApiKeyFromEnv()
  return createBytePlusVideo(model, apiKey, config)
}
