import { resolveMediaPrompt } from '@tanstack/ai'
import { BaseVideoAdapter, snapToDurationOption } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { getGrokApiKeyFromEnv, withGrokDefaults } from '../utils/client'
import {
  GROK_VIDEO_MAX_REFERENCE_AUDIOS,
  GROK_VIDEO_MAX_REFERENCE_IMAGES,
  getGrokVideoDurationOptions,
  isGrokVideoReferenceModel,
  isGrokVideoSourceModel,
  parseGrokVideoSize,
  validateVideoSize,
} from '../video/video-provider-options'
import type { DurationOptions } from '@tanstack/ai/adapters'
import type {
  ImagePart,
  MediaInputMetadata,
  TokenUsage,
  VideoGenerationOptions,
  VideoJobResult,
  VideoPart,
  VideoStatusResult,
  VideoUrlResult,
} from '@tanstack/ai'
import type { GrokVideoModel } from '../model-meta'
import type {
  GrokVideoModelDurationByName,
  GrokVideoModelInputModalitiesByName,
  GrokVideoModelProviderOptionsByName,
  GrokVideoModelSizeByName,
  GrokVideoRuntimeOptions,
} from '../video/video-provider-options'
import type { GrokClientConfig } from '../utils/client'

/**
 * Configuration for Grok video adapter.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface GrokVideoConfig extends GrokClientConfig {}

/**
 * xAI bills video generation in "USD ticks": 10^10 ticks per US dollar
 * (e.g. one grok-imagine-video-1.5 second costs $0.08 = 800_000_000 ticks).
 */
const USD_TICKS_PER_DOLLAR = 10_000_000_000

/** Response of the POST /v1/videos/{generations,edits,extensions} endpoints. */
interface GrokVideoCreateResponse {
  request_id?: string
}

/** Response of GET /v1/videos/{request_id}. */
interface GrokVideoStatusResponse {
  status?: string
  progress?: number
  model?: string
  video?: {
    url?: string
    duration?: number
  }
  usage?: {
    cost_in_usd_ticks?: number
  }
  error?: string
}

/**
 * Convert a TanStack image / video part to the URL string accepted by xAI's
 * Imagine video endpoints: public URLs pass through (fetched by xAI's
 * servers), data sources become base64 data URIs.
 */
function mediaPartToUrl(
  part: ImagePart<MediaInputMetadata> | VideoPart<MediaInputMetadata>,
): string {
  if (part.source.type === 'url') return part.source.value
  return `data:${part.source.mimeType};base64,${part.source.value}`
}

function buildGrokVideoUsage(
  response: GrokVideoStatusResponse,
): TokenUsage | undefined {
  const seconds = response.video?.duration
  const ticks = response.usage?.cost_in_usd_ticks
  if (seconds === undefined && ticks === undefined) return undefined
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    ...(seconds !== undefined && {
      billed: { quantity: seconds, unit: 'seconds' },
      unitsBilled: seconds,
    }),
    ...(ticks !== undefined && { cost: ticks / USD_TICKS_PER_DOLLAR }),
  }
}

/**
 * Grok Video Generation Adapter (xAI Imagine API)
 *
 * Tree-shakeable adapter for the grok-imagine video models using the
 * async jobs/polling architecture: create a generation request, poll it,
 * then read the completed video URL.
 *
 * Both models support text-to-video and image-to-video;
 * `grok-imagine-video-1.5` is xAI's documented default and adds native
 * 1080p generation plus reference-to-video inputs. Source-video edit
 * and extend are `grok-imagine-video` only.
 *
 * The Imagine video endpoints are not part of the OpenAI SDK surface (and
 * xAI rejects the SDK's multipart paths), so requests are plain JSON calls
 * issued with the configured `fetch` (or the global one).
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * Features:
 * - Async job-based video generation (1–15 second clips with audio)
 * - Aspect-ratio sizing via the "aspectRatio_resolution" size template
 *   (e.g. '16:9_720p'), consistent with the grok-imagine image models
 * - Image-to-video via an `image` prompt part (starting frame URL or data URI)
 * - Reference-to-video via image prompt parts with
 *   `metadata.role: 'reference'` or `'character'` (→ `reference_images`)
 *   and preset voices via `modelOptions.reference_audios`
 *   (grok-imagine-video-1.5 only)
 * - Video editing / extension on `grok-imagine-video` via a source
 *   `video` prompt part and `modelOptions.mode: 'edit' | 'extend'`
 *   (`/v1/videos/edits` / `/v1/videos/extensions`; in extend mode
 *   `duration` is the added tail)
 * - Usage reporting: billed seconds (`usage.billed`) and exact cost
 */
export class GrokVideoAdapter<
  TModel extends GrokVideoModel,
> extends BaseVideoAdapter<
  TModel,
  GrokVideoModelProviderOptionsByName[TModel],
  GrokVideoModelProviderOptionsByName,
  GrokVideoModelSizeByName,
  GrokVideoModelInputModalitiesByName,
  GrokVideoModelDurationByName
> {
  readonly name = 'grok' as const

  private readonly clientConfig: GrokVideoConfig

  constructor(config: GrokVideoConfig, model: TModel) {
    super({}, model)
    this.clientConfig = withGrokDefaults(config)
  }

  private async request(
    path: string,
    init?: Omit<RequestInit, 'headers'>,
  ): Promise<Response> {
    // workerd's fetch must be invoked with this === globalThis
    const fetchFn = this.clientConfig.fetch ?? globalThis.fetch.bind(globalThis)
    return await fetchFn(`${this.clientConfig.baseURL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.clientConfig.apiKey}`,
      },
    })
  }

  /**
   * Reads the error message out of an Imagine API error body
   * (`{"code": "...", "error": "..."}`), falling back to the raw text.
   */
  private async errorMessage(response: Response): Promise<string> {
    const body = await response.text()
    try {
      const parsed: unknown = JSON.parse(body)
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'error' in parsed &&
        typeof parsed.error === 'string'
      ) {
        return parsed.error
      }
    } catch {
      // not JSON — fall through to the raw body
    }
    return body
  }

  async createVideoJob(
    options: VideoGenerationOptions<
      GrokVideoModelProviderOptionsByName[TModel],
      GrokVideoModelSizeByName[TModel],
      GrokVideoModelDurationByName[TModel]
    >,
  ): Promise<VideoJobResult> {
    const { model, size, modelOptions, logger } = options

    // `mode` is a routing hint for this adapter, not an API field — strip it
    // before the remaining options are spread onto the request body. The
    // per-model map narrows what callers can pass, but modelOptions often
    // arrives as deserialized JSON, so the adapter handles the widest option
    // surface (the 1.5 shape) uniformly and gates by model at runtime.
    const { mode, ...wireOptions } = (modelOptions ??
      {}) as GrokVideoRuntimeOptions

    // `mode` is typed 'edit' | 'extend' but reaches us untrusted from JSON
    // callers. An unrecognised value must not fall through to the
    // generations endpoint with a source-video body — that would silently
    // run (and bill) a generation the caller never asked for.
    if (mode !== undefined && mode !== 'edit' && mode !== 'extend') {
      throw new Error(
        `${this.name}: unknown modelOptions.mode '${String(mode)}'. ` +
          `Expected 'edit' or 'extend'.`,
      )
    }

    // The interleaved prompt decomposes into verbatim text plus typed media
    // buckets. Reference audio is voice-id based (not an audio file), so
    // audio prompt parts have no request field to land in.
    const resolved = resolveMediaPrompt(options.prompt)
    if (resolved.audios.length > 0) {
      throw new Error(
        `${this.name}.createVideoJob does not support audio prompt parts (model: ${model}). ` +
          `To reference a preset voice, pass modelOptions.reference_audios ` +
          `(e.g. [{ voice_id: 'eve' }]).`,
      )
    }

    // A video prompt part is the source clip for edit / extension mode.
    // Those endpoints are grok-imagine-video only — 1.5 has no video input.
    if (
      !isGrokVideoSourceModel(model) &&
      (mode !== undefined || resolved.videos.length > 0)
    ) {
      throw new Error(
        `${this.name}: ${model} does not support video editing or extension. ` +
          `Use 'grok-imagine-video' for /v1/videos/edits and /v1/videos/extensions.`,
      )
    }

    // The mode must be chosen explicitly because the two endpoints have
    // different semantics (edit rewrites the clip, extend appends
    // `duration` seconds).
    if (resolved.videos.length > 1) {
      throw new Error(
        `${this.name}: ${model} accepts at most one source video; received ${resolved.videos.length}.`,
      )
    }
    const [sourceVideo] = resolved.videos
    if (sourceVideo && mode === undefined) {
      throw new Error(
        `${this.name}: a video prompt part needs modelOptions.mode set to ` +
          `'edit' (rewrite the clip) or 'extend' (append to it).`,
      )
    }
    if (!sourceVideo && mode !== undefined) {
      throw new Error(
        `${this.name}: modelOptions.mode '${mode}' requires a video prompt ` +
          `part carrying the source clip.`,
      )
    }

    if (mode !== undefined && sourceVideo) {
      return await this.createSourceVideoJob({
        model,
        mode,
        sourceVideo,
        resolved,
        wireOptions,
        size,
        genericDuration: options.duration,
        logger,
      })
    }

    validateVideoSize(model, size)

    // Pull the specially-handled keys out of the wire options: `duration`
    // is folded into the snapped value below, and the reference fields are
    // re-added explicitly so a JSON-serialized `null` or empty array reads
    // as "unset" instead of leaking onto the wire.
    const {
      duration: rawOptionDuration,
      reference_images: explicitReferenceImages,
      reference_audios: referenceAudios,
      ...generationOptions
    } = wireOptions

    // Coerce the requested duration into the model's valid range (1–15s,
    // integer) instead of rejecting it — `snapDuration` clamps and rounds.
    // modelOptions wins over the generic `duration`, mirroring the size
    // precedence below.
    const rawDuration = rawOptionDuration ?? options.duration
    const duration =
      rawDuration != null ? this.snapDuration(rawDuration) : undefined

    // Image parts split by role: un-roled / 'start_frame' images become the
    // starting frame (image-to-video); 'reference' / 'character' images
    // become reference_images (reference-to-video). The Imagine API has no
    // mask / control / end-frame inputs. Unknown role strings (possible via
    // JSON callers) throw rather than silently dropping the part.
    const startFrames: Array<ImagePart<MediaInputMetadata>> = []
    const referenceImages: Array<{ url: string }> = []
    for (const part of resolved.images) {
      const role = part.metadata?.role
      switch (role) {
        case 'mask':
        case 'control':
        case 'end_frame':
          throw new Error(
            `${this.name}: the Imagine video API has no '${role}' image ` +
              `input on model ${model}. Use an un-roled / 'start_frame' ` +
              `image as the starting frame, or 'reference' images.`,
          )
        case 'reference':
        case 'character':
          referenceImages.push({ url: mediaPartToUrl(part) })
          break
        case 'start_frame':
        case undefined:
          startFrames.push(part)
          break
        default:
          throw new Error(
            `${this.name}: unknown image metadata.role '${String(role)}'. ` +
              `Expected 'start_frame', 'reference', or 'character'.`,
          )
      }
    }
    if (startFrames.length > 1) {
      throw new Error(
        `${this.name}: ${model} accepts at most one starting-frame image; received ${startFrames.length}. ` +
          `Use metadata.role: 'reference' for reference-to-video inputs.`,
      )
    }
    // Explicit modelOptions.reference_images replaces the part-derived list
    // (an explicit empty array means "none").
    const finalReferenceImages =
      explicitReferenceImages ??
      (referenceImages.length > 0 ? referenceImages : undefined)
    const referenceImageCount = finalReferenceImages?.length ?? 0
    const referenceAudioCount = referenceAudios?.length ?? 0
    const hasReference = referenceImageCount > 0 || referenceAudioCount > 0

    // Reference inputs are a grok-imagine-video-1.5 feature. The per-model
    // options map already hides the fields from other models at compile
    // time; this runtime gate covers prompt-part roles and untyped callers.
    if (!isGrokVideoReferenceModel(model) && hasReference) {
      throw new Error(
        `${this.name}: ${model} does not support reference-to-video inputs. ` +
          `Use 'grok-imagine-video-1.5' for reference_images / reference_audios.`,
      )
    }
    if (referenceAudioCount > GROK_VIDEO_MAX_REFERENCE_AUDIOS) {
      throw new Error(
        `${this.name}: ${model} accepts at most ${GROK_VIDEO_MAX_REFERENCE_AUDIOS} reference voices; received ${referenceAudioCount}.`,
      )
    }
    if (referenceImageCount > GROK_VIDEO_MAX_REFERENCE_IMAGES) {
      throw new Error(
        `${this.name}: ${model} accepts at most ${GROK_VIDEO_MAX_REFERENCE_IMAGES} reference images; received ${referenceImageCount}.`,
      )
    }

    // Image-to-video: the single image prompt part becomes the starting frame
    // and the prompt text describes the desired motion. URL sources are
    // fetched by xAI's servers; data sources are sent as base64 data URIs.
    const [startFrame] = startFrames

    // xAI rejects `image` + `reference_images` / `reference_audios` as a
    // 400: only one of image-to-video or reference-to-video can be active.
    if (startFrame && hasReference) {
      throw new Error(
        `${this.name}: image-to-video and reference-to-video cannot be combined. ` +
          `Use a starting-frame image, or reference images / voices, not both.`,
      )
    }

    // The generic `size` option carries an "aspectRatio_resolution" template
    // (e.g. '16:9_720p') and maps to the Imagine API's `aspect_ratio` /
    // `resolution` parameters; explicit modelOptions win over the template
    // (including `reference_images`, which replaces the part-derived list).
    const parsedSize = size !== undefined ? parseGrokVideoSize(size) : undefined
    const resolvedResolution =
      generationOptions.resolution ?? parsedSize?.resolution
    if (hasReference && resolvedResolution === '1080p') {
      throw new Error(
        `${this.name}: reference-to-video is capped at 720p on ${model}.`,
      )
    }
    const request = {
      model,
      prompt: resolved.text,
      ...(startFrame && { image: { url: mediaPartToUrl(startFrame) } }),
      ...(referenceImageCount > 0 && {
        reference_images: finalReferenceImages,
      }),
      ...(referenceAudioCount > 0 && {
        reference_audios: referenceAudios,
      }),
      ...(parsedSize && {
        aspect_ratio: parsedSize.aspectRatio,
        ...(parsedSize.resolution !== undefined && {
          resolution: parsedSize.resolution,
        }),
      }),
      // The remaining options spread after the size template so explicit
      // aspect_ratio / resolution win over it; duration and the reference
      // fields were destructured out above and re-added normalized.
      ...generationOptions,
      ...(duration !== undefined && { duration }),
    }

    return await this.postVideoJob('/videos/generations', request, {
      model,
      logger,
      logLine: `activity=video.create provider=${this.name} model=${model} mode=generate size=${size ?? 'default'} duration=${duration ?? 'default'}`,
    })
  }

  /**
   * Build and post an edit / extension request. Both endpoints take only
   * `model`, `prompt`, and the source `video` (plus `duration` — the length
   * of the added tail — for extensions): output geometry is inherited from
   * the source clip, capped at 720p, and edit outputs also inherit the
   * source length. Rather than sending fields the API documents as ignored,
   * the inapplicable options are rejected with actionable errors.
   */
  private async createSourceVideoJob(args: {
    model: string
    mode: 'edit' | 'extend'
    sourceVideo: VideoPart<MediaInputMetadata>
    resolved: ReturnType<typeof resolveMediaPrompt>
    wireOptions: Omit<GrokVideoRuntimeOptions, 'mode'>
    size: string | undefined
    genericDuration: number | undefined
    logger: VideoGenerationOptions<GrokVideoRuntimeOptions>['logger']
  }): Promise<VideoJobResult> {
    const { model, mode, sourceVideo, resolved, wireOptions, logger } = args
    const endpoint = mode === 'edit' ? '/videos/edits' : '/videos/extensions'

    if (resolved.images.length > 0) {
      throw new Error(
        `${this.name}: '${mode}' mode takes only the source video — image ` +
          `prompt parts are not supported by ${endpoint}.`,
      )
    }

    // Pull every generation-only key out of the wire options so nothing can
    // leak into the edit/extend body via the spread below. JSON-serialized
    // `null` values (a common "unset" encoding) are treated as absent;
    // actual values are rejected with actionable errors.
    const {
      aspect_ratio: aspectRatio,
      resolution,
      duration: modeDuration,
      reference_images: referenceImagesOption,
      reference_audios: referenceAudiosOption,
      ...passthrough
    } = wireOptions
    if (
      (referenceImagesOption?.length ?? 0) > 0 ||
      (referenceAudiosOption?.length ?? 0) > 0
    ) {
      throw new Error(
        `${this.name}: reference inputs are only supported by video ` +
          `generation, not '${mode}' mode.`,
      )
    }
    if (args.size !== undefined || aspectRatio != null || resolution != null) {
      throw new Error(
        `${this.name}: '${mode}' mode does not accept size / aspect_ratio / ` +
          `resolution — the output inherits the source clip's geometry ` +
          `(capped at 720p).`,
      )
    }
    const rawDuration = modeDuration ?? args.genericDuration
    if (mode === 'edit' && rawDuration != null) {
      throw new Error(
        `${this.name}: 'edit' mode does not accept a duration — the output ` +
          `inherits the source clip's length. Use mode 'extend' to append ` +
          `seconds to the clip.`,
      )
    }
    // Extend: the snapped duration is the added-tail length (1–15s).
    const duration =
      rawDuration != null ? this.snapDuration(rawDuration) : undefined

    const request = {
      model,
      prompt: resolved.text,
      video: { url: mediaPartToUrl(sourceVideo) },
      ...passthrough,
      ...(duration !== undefined && { duration }),
    }

    return await this.postVideoJob(endpoint, request, {
      model,
      logger,
      logLine: `activity=video.create provider=${this.name} model=${model} mode=${mode} duration=${duration ?? 'default'}`,
    })
  }

  /**
   * POST a create-job request body to one of the Imagine video endpoints
   * (`/videos/generations`, `/videos/edits`, `/videos/extensions`) and read
   * the `request_id` out of the shared response shape.
   */
  private async postVideoJob(
    endpoint: string,
    request: Record<string, unknown>,
    context: {
      model: string
      logger: VideoGenerationOptions<GrokVideoRuntimeOptions>['logger']
      logLine: string
    },
  ): Promise<VideoJobResult> {
    const { model, logger, logLine } = context
    try {
      logger.request(logLine, { provider: this.name, model })

      const response = await this.request(endpoint, {
        method: 'POST',
        body: JSON.stringify(request),
      })
      if (!response.ok) {
        throw new Error(
          `grok: ${endpoint} request failed (${response.status} ${response.statusText}): ${await this.errorMessage(response)}`,
        )
      }

      const result = (await response.json()) as GrokVideoCreateResponse
      if (!result.request_id) {
        throw new Error(`grok: ${endpoint} response contained no request_id`)
      }
      return { jobId: result.request_id, model }
    } catch (error: unknown) {
      logger.errors(`${this.name}.createVideoJob fatal`, {
        error: toRunErrorPayload(error, `${this.name}.createVideoJob failed`),
        source: `${this.name}.createVideoJob`,
      })
      throw error
    }
  }

  private async retrieveJob(jobId: string): Promise<GrokVideoStatusResponse> {
    const response = await this.request(`/videos/${jobId}`)
    if (!response.ok) {
      const error = new Error(
        `grok: video status request failed (${response.status} ${response.statusText}): ${await this.errorMessage(response)}`,
      )
      ;(error as { status?: number }).status = response.status
      throw error
    }
    return (await response.json()) as GrokVideoStatusResponse
  }

  async getVideoStatus(jobId: string): Promise<VideoStatusResult> {
    let response: GrokVideoStatusResponse
    try {
      response = await this.retrieveJob(jobId)
    } catch (error) {
      if ((error as { status?: number }).status === 404) {
        return { jobId, status: 'failed', error: 'Job not found' }
      }
      throw error
    }

    return {
      jobId,
      status: this.mapStatus(response.status),
      ...(response.progress !== undefined && { progress: response.progress }),
      ...(response.error !== undefined && { error: response.error }),
    }
  }

  async getVideoUrl(jobId: string): Promise<VideoUrlResult> {
    let response: GrokVideoStatusResponse
    try {
      response = await this.retrieveJob(jobId)
    } catch (error) {
      if ((error as { status?: number }).status === 404) {
        throw new Error(`Video job not found: ${jobId}`)
      }
      throw error
    }

    const status = this.mapStatus(response.status)
    if (status === 'failed') {
      throw new Error(
        `Video generation failed${response.error ? `: ${response.error}` : ''}. Job ID: ${jobId}`,
      )
    }
    const url = response.video?.url
    if (!url) {
      throw new Error(
        `Video is not ready for download. Check status first. Job ID: ${jobId}`,
      )
    }

    const usage = buildGrokVideoUsage(response)
    return {
      jobId,
      url,
      ...(usage && { usage }),
    }
  }

  /**
   * Maps Imagine API job statuses onto the generic video status set. The
   * API reports 'pending' while queued/generating (with a numeric
   * `progress`), then a terminal 'done' / 'failed' / 'expired'.
   */
  protected mapStatus(
    apiStatus: string | undefined,
  ): 'pending' | 'processing' | 'completed' | 'failed' {
    switch (apiStatus) {
      case 'pending':
      case 'queued':
        return 'pending'
      case 'done':
      case 'completed':
      case 'succeeded':
        return 'completed'
      case 'failed':
      case 'expired':
      case 'error':
      case 'cancelled':
        return 'failed'
      case undefined:
      default:
        return 'processing'
    }
  }

  /**
   * Both grok-imagine video models accept a continuous 1–15 integer-second
   * range. Consumers can use this to render UI without provider knowledge.
   */
  override availableDurations(): DurationOptions<
    GrokVideoModelDurationByName[TModel]
  > {
    return getGrokVideoDurationOptions(this.model)
  }

  /**
   * Coerce a raw seconds value to the closest valid duration (clamped to
   * [1, 15] and rounded to whole seconds).
   */
  override snapDuration(
    seconds: number,
  ): GrokVideoModelDurationByName[TModel] | undefined {
    return snapToDurationOption(seconds, this.availableDurations())
  }
}

/**
 * Creates a Grok video adapter with an explicit API key.
 * Type resolution happens here at the call site.
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * @param model - The model name (e.g., 'grok-imagine-video-1.5')
 * @param apiKey - Your xAI API key
 * @param config - Optional additional configuration
 * @returns Configured Grok video adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createGrokVideo('grok-imagine-video-1.5', 'xai-...');
 *
 * const { jobId } = await generateVideo({
 *   adapter,
 *   prompt: 'A beautiful sunset over the ocean',
 *   size: '16:9_720p',
 *   duration: 5
 * });
 * ```
 */
export function createGrokVideo<TModel extends GrokVideoModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GrokVideoConfig, 'apiKey'>,
): GrokVideoAdapter<TModel> {
  return new GrokVideoAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Grok video adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `XAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * @param model - The model name (e.g., 'grok-imagine-video-1.5')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Grok video adapter instance with resolved types
 * @throws Error if XAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses XAI_API_KEY from environment
 * const adapter = grokVideo('grok-imagine-video-1.5');
 *
 * // Image-to-video: an optional image prompt part is the starting frame.
 * const { jobId } = await generateVideo({
 *   adapter,
 *   prompt: [
 *     { type: 'text', content: 'Make the cat start playing the piano' },
 *     { type: 'image', source: { type: 'url', value: 'https://example.com/cat.png' } },
 *   ],
 * });
 *
 * // Poll for status
 * const status = await getVideoJobStatus({ adapter, jobId });
 * ```
 */
export function grokVideo<TModel extends GrokVideoModel>(
  model: TModel,
  config?: Omit<GrokVideoConfig, 'apiKey'>,
): GrokVideoAdapter<TModel> {
  const apiKey = getGrokApiKeyFromEnv()
  return createGrokVideo(model, apiKey, config)
}
