import { resolveMediaPrompt } from '@tanstack/ai'
import { BaseVideoAdapter, snapToDurationOption } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { getGrokApiKeyFromEnv, withGrokDefaults } from '../utils/client'
import {
  getGrokVideoDurationOptions,
  isImageToVideoOnlyModel,
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
  VideoStatusResult,
  VideoUrlResult,
} from '@tanstack/ai'
import type { GrokVideoModel } from '../model-meta'
import type {
  GrokVideoModelDurationByName,
  GrokVideoModelInputModalitiesByName,
  GrokVideoModelProviderOptionsByName,
  GrokVideoModelSizeByName,
  GrokVideoProviderOptions,
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

/** Response of POST /v1/videos/generations. */
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
 * Convert a TanStack ImagePart to the URL string accepted by xAI's Imagine
 * video endpoint: public URLs pass through (fetched by xAI's servers), data
 * sources become base64 data URIs.
 */
function imagePartToUrl(part: ImagePart<MediaInputMetadata>): string {
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
    ...(seconds !== undefined && { unitsBilled: seconds }),
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
 * `grok-imagine-video` (v1.0) supports text-to-video and image-to-video.
 * `grok-imagine-video-1.5` is image-to-video only — every request needs an
 * image prompt part as the starting frame, and the adapter rejects a
 * text-only prompt with a clear error rather than a raw API 400.
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
 * - Usage reporting: billed seconds (`unitsBilled`) and exact cost
 */
export class GrokVideoAdapter<
  TModel extends GrokVideoModel,
> extends BaseVideoAdapter<
  TModel,
  GrokVideoProviderOptions,
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

  private get fetch(): (
    input: string,
    init?: RequestInit,
  ) => Promise<Response> {
    return this.clientConfig.fetch ?? fetch
  }

  private async request(
    path: string,
    init?: Omit<RequestInit, 'headers'>,
  ): Promise<Response> {
    return await this.fetch(`${this.clientConfig.baseURL}${path}`, {
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
      GrokVideoProviderOptions,
      GrokVideoModelSizeByName[TModel],
      GrokVideoModelDurationByName[TModel]
    >,
  ): Promise<VideoJobResult> {
    const { model, size, modelOptions, logger } = options

    validateVideoSize(model, size)

    // Coerce the requested duration into the model's valid range (1–15s,
    // integer) instead of rejecting it — `snapDuration` clamps and rounds.
    // modelOptions wins over the generic `duration`, mirroring the size
    // precedence below.
    const rawDuration = modelOptions?.duration ?? options.duration
    const duration =
      rawDuration !== undefined ? this.snapDuration(rawDuration) : undefined

    // The interleaved prompt decomposes into verbatim text plus typed media
    // buckets. The Imagine video endpoint takes a text prompt and an optional
    // starting frame; reject the modalities it can't consume.
    const resolved = resolveMediaPrompt(options.prompt)
    if (resolved.videos.length > 0) {
      throw new Error(
        `${this.name}.createVideoJob does not support video prompt parts (model: ${model}).`,
      )
    }
    if (resolved.audios.length > 0) {
      throw new Error(
        `${this.name}.createVideoJob does not support audio prompt parts (model: ${model}).`,
      )
    }
    // grok-imagine-video-1.5 is image-to-video only — text-to-video is
    // rejected by the API, so fail fast with a clear, actionable message
    // pointing at the model that does support text-to-video.
    if (resolved.images.length === 0 && isImageToVideoOnlyModel(model)) {
      throw new Error(
        `${this.name}: ${model} does not support text-to-video — it is image-to-video only. ` +
          `Include an image prompt part as the starting frame, or use 'grok-imagine-video' for text-to-video.`,
      )
    }
    if (resolved.images.length > 1) {
      throw new Error(
        `${this.name}: ${model} accepts at most one starting-frame image; received ${resolved.images.length}.`,
      )
    }

    // Image-to-video: the single image prompt part becomes the starting frame
    // and the prompt text describes the desired motion. URL sources are
    // fetched by xAI's servers; data sources are sent as base64 data URIs.
    const [startFrame] = resolved.images

    // The generic `size` option carries an "aspectRatio_resolution" template
    // (e.g. '16:9_720p') and maps to the Imagine API's `aspect_ratio` /
    // `resolution` parameters; explicit modelOptions win over the template.
    const parsedSize = size !== undefined ? parseGrokVideoSize(size) : undefined
    const request = {
      model,
      prompt: resolved.text,
      ...(startFrame && { image: { url: imagePartToUrl(startFrame) } }),
      ...(parsedSize && {
        aspect_ratio: parsedSize.aspectRatio,
        ...(parsedSize.resolution !== undefined && {
          resolution: parsedSize.resolution,
        }),
      }),
      ...modelOptions,
      // Spread after modelOptions so the snapped duration is authoritative
      // (modelOptions.duration is folded into `duration` via snapDuration above).
      ...(duration !== undefined && { duration }),
    }

    try {
      logger.request(
        `activity=video.create provider=${this.name} model=${model} size=${size ?? 'default'} duration=${duration ?? 'default'}`,
        { provider: this.name, model },
      )

      const response = await this.request('/videos/generations', {
        method: 'POST',
        body: JSON.stringify(request),
      })
      if (!response.ok) {
        throw new Error(
          `grok: video generation request failed (${response.status} ${response.statusText}): ${await this.errorMessage(response)}`,
        )
      }

      const result = (await response.json()) as GrokVideoCreateResponse
      if (!result.request_id) {
        throw new Error(
          'grok: video generation response contained no request_id',
        )
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
 * @param model - The model name (e.g., 'grok-imagine-video')
 * @param apiKey - Your xAI API key
 * @param config - Optional additional configuration
 * @returns Configured Grok video adapter instance with resolved types
 *
 * @example
 * ```typescript
 * // grok-imagine-video (v1.0) supports text-to-video.
 * const adapter = createGrokVideo('grok-imagine-video', 'xai-...');
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
 * // Image-to-video only: the prompt must carry a starting-frame image part.
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
