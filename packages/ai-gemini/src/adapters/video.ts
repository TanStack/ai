import {
  GenerateVideosOperation,
  VideoGenerationReferenceType,
} from '@google/genai'
import { resolveMediaPrompt } from '@tanstack/ai'
import { BaseVideoAdapter, snapToDurationOption } from '@tanstack/ai/adapters'
import { arrayBufferToBase64 } from '@tanstack/ai-utils'
import { createGeminiClient, getGeminiApiKeyFromEnv } from '../utils'
import {
  getGeminiVideoDurationOptions,
  isInteractionsVideoModel,
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
import type {
  GenerateVideosConfig,
  GoogleGenAI,
  Image,
  Interactions,
  VideoGenerationReferenceImage,
} from '@google/genai'
import type {
  GeminiOmniVideoProviderOptions,
  GeminiVideoModel,
  GeminiVideoModelDurationByName,
  GeminiVideoModelInputModalitiesByName,
  GeminiVideoModelProviderOptionsByName,
  GeminiVideoModelSizeByName,
  GeminiVideoProviderOptions,
  GeminiVideoSize,
} from '../video/video-provider-options'
import type { GeminiClientConfig } from '../utils/client'

type Interaction = Interactions.Interaction
type InteractionContent = Interactions.Content

/**
 * Configuration for Gemini video adapter.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface GeminiVideoConfig extends GeminiClientConfig {
  /**
   * Opt into fetching HTTP(S) image URL inputs. Veo's predict API accepts
   * only inline `imageBytes` or a `gcsUri`, so an HTTP(S) URL has to be
   * downloaded and base64-encoded locally — which buffers the whole image in
   * memory and can OOM constrained runtimes (e.g. Cloudflare Workers). When
   * `false` (the default), HTTP(S) URL image inputs throw; pass a `data:` URI
   * or a `gs://` reference, or set this to `true` to opt into buffering.
   */
  allowUrlFetch?: boolean
}

/**
 * Extract a human-readable message from a long-running operation's error,
 * which the SDK types as `Record<string, unknown>` (a google.rpc.Status).
 */
function operationErrorMessage(error: Record<string, unknown>): string {
  if (typeof error.message === 'string' && error.message.length > 0) {
    return error.message
  }
  return JSON.stringify(error)
}

/**
 * Convert a TanStack image prompt part into the genai `Image` shape Veo
 * accepts: base64 `imageBytes` (data sources, data: URIs, fetched HTTP
 * URLs) or a `gcsUri` passthrough for Cloud Storage references.
 *
 * Unlike `generateContent` (chat / native image generation), Veo's predict
 * API has no `fileData.fileUri` equivalent — `Image` only accepts
 * `imageBytes` or `gcsUri`. An HTTP(S) URL therefore has to be fetched and
 * inlined locally, which buffers the whole image in memory; that only happens
 * when the caller opts in via `allowUrlFetch`, otherwise it throws. Prefer a
 * `gs://` reference on memory-constrained runtimes.
 */
async function imagePartToVeoImage(
  part: ImagePart<MediaInputMetadata>,
  allowUrlFetch: boolean,
): Promise<Image> {
  if (part.source.type === 'data') {
    return {
      imageBytes: part.source.value,
      mimeType: part.source.mimeType || 'image/png',
    }
  }
  const url = part.source.value
  if (url.startsWith('gs://')) {
    return {
      gcsUri: url,
      ...(part.source.mimeType && { mimeType: part.source.mimeType }),
    }
  }
  if (url.startsWith('data:')) {
    const match = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/)
    if (!match || !match[2]) {
      throw new Error(
        'gemini: only base64 data: URIs are supported for video image inputs.',
      )
    }
    return {
      imageBytes: match[3] ?? '',
      mimeType: match[1] || part.source.mimeType || 'image/png',
    }
  }
  if (!allowUrlFetch) {
    throw new Error(
      `gemini Veo: HTTP(S) URL image inputs are not fetched by default because ` +
        `Veo accepts only inline bytes, so the image would be downloaded and ` +
        `buffered in memory (risking OOM on constrained runtimes). Pass a ` +
        `data: URI or a gs:// reference, or set \`allowUrlFetch: true\` on the ` +
        `adapter config to opt into fetching. URL: ${url}`,
    )
  }
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch image input (${response.status} ${response.statusText}): ${url}`,
    )
  }
  const blob = await response.blob()
  const buffer = await blob.arrayBuffer()
  return {
    imageBytes: arrayBufferToBase64(buffer),
    mimeType: part.source.mimeType || blob.type || 'image/png',
  }
}

/**
 * Convert an image or video prompt part into an Interactions API content
 * block. Data sources become inline base64 `data`; URL sources pass through
 * as `uri` (Files API URIs — mirrors the Interactions text adapter).
 */
function mediaPartToInteractionsContent(
  part: ImagePart<MediaInputMetadata> | VideoPart<MediaInputMetadata>,
): InteractionContent {
  const mimeType = part.source.mimeType
  if (part.type === 'image') {
    return part.source.type === 'data'
      ? { type: 'image', data: part.source.value, mime_type: mimeType }
      : { type: 'image', uri: part.source.value, mime_type: mimeType }
  }
  return part.source.type === 'data'
    ? { type: 'video', data: part.source.value, mime_type: mimeType }
    : { type: 'video', uri: part.source.value, mime_type: mimeType }
}

/**
 * Pull the generated video out of a completed interaction. Prefers the
 * SDK's `output_video` sugar, then walks `steps` back-to-front for the last
 * `model_output` step carrying a video content block (the wire shape the
 * raw REST response uses).
 */
function extractInteractionVideo(
  interaction: Interaction,
): { data?: string; uri?: string; mimeType: string } | undefined {
  const direct = interaction.output_video
  if (direct && (direct.data || direct.uri)) {
    return {
      data: direct.data,
      uri: direct.uri,
      mimeType: direct.mime_type || 'video/mp4',
    }
  }
  const steps = interaction.steps ?? []
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]
    if (step?.type !== 'model_output') continue
    for (const block of step.content ?? []) {
      if (block.type === 'video' && (block.data || block.uri)) {
        return {
          data: block.data,
          uri: block.uri,
          mimeType: block.mime_type || 'video/mp4',
        }
      }
    }
  }
  return undefined
}

/**
 * Map Interactions usage onto the canonical TokenUsage shape. Omni reports
 * video output via `output_tokens_by_modality`; fall back to the video
 * modality entry when the total is absent.
 */
function interactionUsageToTokenUsage(
  usage: Interaction['usage'],
): TokenUsage | undefined {
  if (!usage) return undefined
  const videoTokens = usage.output_tokens_by_modality?.find(
    (entry) => entry.modality === 'video',
  )?.tokens
  const promptTokens = usage.total_input_tokens ?? 0
  const completionTokens = usage.total_output_tokens ?? videoTokens ?? 0
  return {
    promptTokens,
    completionTokens,
    totalTokens: usage.total_tokens ?? promptTokens + completionTokens,
  }
}

/**
 * Gemini Video Generation Adapter (Veo + Gemini Omni Flash)
 *
 * Tree-shakeable adapter for Google video generation, routing by model:
 *
 * **Veo models** run as a long-running operation: `createVideoJob` starts
 * the operation via the `:predictLongRunning` endpoint, `getVideoStatus`
 * polls it, and `getVideoUrl` extracts the generated video's URI once it
 * completes. Image prompt parts are routed by `metadata.role`:
 * - `'start_frame'` (or the first un-roled image) → the input image the
 *   video starts from
 * - `'end_frame'` → `lastFrame` (the frame the video ends on)
 * - `'reference'` / `'character'` → `referenceImages` (asset references,
 *   Veo 3.1)
 *
 * Note: the returned Veo video URI is served by the Gemini Files API and
 * requires the API key (`x-goog-api-key` header or `?key=` query
 * parameter) to download.
 *
 * **Gemini Omni Flash** (`gemini-omni-flash-preview`) only serves the
 * Interactions API: `createVideoJob` creates a background interaction with
 * `response_modalities: ['video']`, `getVideoStatus` polls it by id, and
 * `getVideoUrl` returns the inline base64 MP4 as a `data:` URL (or the
 * Files API URI when the server delivers by reference). Image and video
 * prompt parts are sent as interaction content blocks, grouped as images,
 * then videos, then the text prompt (interleaving is not preserved); pass
 * `modelOptions.previous_interaction_id` to conversationally edit a prior
 * Omni generation.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export class GeminiVideoAdapter<
  TModel extends GeminiVideoModel,
> extends BaseVideoAdapter<
  TModel,
  GeminiVideoModelProviderOptionsByName[TModel],
  GeminiVideoModelProviderOptionsByName,
  GeminiVideoModelSizeByName,
  GeminiVideoModelInputModalitiesByName,
  GeminiVideoModelDurationByName
> {
  readonly name = 'gemini' as const

  protected client: GoogleGenAI
  private readonly allowUrlFetch: boolean

  constructor(config: GeminiVideoConfig, model: TModel) {
    super({}, model)
    this.client = createGeminiClient(config)
    this.allowUrlFetch = config.allowUrlFetch ?? false
  }

  async createVideoJob(
    options: VideoGenerationOptions<
      GeminiVideoModelProviderOptionsByName[TModel],
      GeminiVideoSize,
      GeminiVideoModelDurationByName[TModel]
    >,
  ): Promise<VideoJobResult> {
    const { prompt, size, duration, logger } = options

    logger.request(
      `activity=video.create provider=${this.name} model=${this.model} size=${size ?? 'default'} duration=${duration ?? 'default'}`,
      { provider: this.name, model: this.model },
    )

    if (isInteractionsVideoModel(this.model)) {
      return await this.createInteractionsVideoJob(options)
    }
    const modelOptions = options.modelOptions as
      | GeminiVideoProviderOptions
      | undefined

    try {
      const resolved = resolveMediaPrompt(prompt)

      if (resolved.videos.length > 0) {
        throw new Error(
          `${this.name}.createVideoJob does not support video prompt parts (model: ${this.model}).`,
        )
      }
      if (resolved.audios.length > 0) {
        throw new Error(
          `${this.name}.createVideoJob does not support audio prompt parts (model: ${this.model}).`,
        )
      }

      const { image, lastFrame, referenceImages } = await this.routeImageParts(
        resolved.images,
      )

      const config: GenerateVideosConfig = {
        ...modelOptions,
        ...(size !== undefined && { aspectRatio: size }),
        ...(duration !== undefined && { durationSeconds: duration }),
        ...(lastFrame && { lastFrame }),
        ...(referenceImages.length > 0 && { referenceImages }),
      }

      const operation = await this.client.models.generateVideos({
        model: this.model,
        prompt: resolved.text,
        ...(image && { image }),
        config,
      })

      if (!operation.name) {
        throw new Error(
          'Veo did not return an operation name for the video generation job.',
        )
      }

      return { jobId: operation.name, model: this.model }
    } catch (error) {
      logger.errors(`${this.name}.createVideoJob fatal`, {
        error,
        source: `${this.name}.createVideoJob`,
      })
      throw error
    }
  }

  /**
   * Gemini Omni Flash job creation via the Interactions API. Creates a
   * background interaction requesting video output; the interaction id is
   * the job id polled by `getVideoStatus` / `getVideoUrl`.
   */
  private async createInteractionsVideoJob(
    options: VideoGenerationOptions<
      GeminiVideoModelProviderOptionsByName[TModel],
      GeminiVideoSize,
      GeminiVideoModelDurationByName[TModel]
    >,
  ): Promise<VideoJobResult> {
    const { prompt, size, duration, logger } = options
    const modelOptions = options.modelOptions as
      | GeminiOmniVideoProviderOptions
      | undefined

    try {
      const resolved = resolveMediaPrompt(prompt)

      if (resolved.audios.length > 0) {
        throw new Error(
          `${this.name}.createVideoJob does not support audio prompt parts (model: ${this.model}).`,
        )
      }

      const content: Array<InteractionContent> = [
        ...resolved.images.map(mediaPartToInteractionsContent),
        ...resolved.videos.map(mediaPartToInteractionsContent),
      ]
      if (resolved.text) {
        content.push({ type: 'text', text: resolved.text })
      }
      if (content.length === 0) {
        throw new Error(
          `${this.name}.createVideoJob: the prompt produced no content to send (model: ${this.model}).`,
        )
      }

      // Reject out-of-range durations locally rather than snapping (which
      // would silently change the clip length the caller asked for) or
      // letting the live API reject them after the round trip.
      const durations = this.availableDurations()
      if (
        duration !== undefined &&
        durations.kind === 'range' &&
        (duration < durations.min || duration > durations.max)
      ) {
        throw new Error(
          `${this.name}.createVideoJob: duration ${duration}s is outside the ${durations.min}–${durations.max}s range supported by ${this.model}. Use snapDuration() to snap arbitrary values into range.`,
        )
      }

      // Aspect ratio and clip length ride on `response_format`. Duration is
      // a `"<seconds>s"` string, accepted anywhere in the 3–10s range
      // (fractional included) and defaulting to 10s when omitted — verified
      // against the live API; the docs don't publish the range constraints.
      const responseFormat =
        size !== undefined || duration !== undefined
          ? {
              response_format: {
                type: 'video' as const,
                ...(size !== undefined && { aspect_ratio: size }),
                ...(duration !== undefined && { duration: `${duration}s` }),
              },
            }
          : {}

      const interaction = await this.client.interactions.create({
        ...modelOptions,
        model: this.model,
        input: [{ type: 'user_input', content }],
        response_modalities: ['video'],
        background: true,
        ...responseFormat,
      })

      if (!interaction.id) {
        throw new Error(
          'Gemini Omni did not return an interaction id for the video generation job.',
        )
      }

      return { jobId: interaction.id, model: this.model }
    } catch (error) {
      logger.errors(`${this.name}.createVideoJob fatal`, {
        error,
        source: `${this.name}.createVideoJob`,
      })
      throw error
    }
  }

  /**
   * Route image prompt parts onto Veo's request fields by `metadata.role`.
   */
  private async routeImageParts(
    parts: Array<ImagePart<MediaInputMetadata>>,
  ): Promise<{
    image: Image | undefined
    lastFrame: Image | undefined
    referenceImages: Array<VideoGenerationReferenceImage>
  }> {
    let image: Image | undefined
    let lastFrame: Image | undefined
    const referenceImages: Array<VideoGenerationReferenceImage> = []

    for (const part of parts) {
      const role = part.metadata?.role
      switch (role) {
        case 'end_frame': {
          if (lastFrame) {
            throw new Error(
              `${this.name}: Veo accepts at most one 'end_frame' image.`,
            )
          }
          lastFrame = await imagePartToVeoImage(part, this.allowUrlFetch)
          break
        }
        case 'reference':
        case 'character': {
          referenceImages.push({
            image: await imagePartToVeoImage(part, this.allowUrlFetch),
            referenceType: VideoGenerationReferenceType.ASSET,
          })
          break
        }
        case 'start_frame':
        case undefined: {
          if (image) {
            throw new Error(
              `${this.name}: Veo accepts at most one starting image; received multiple 'start_frame'/un-roled images. Use metadata.role ('end_frame', 'reference') to disambiguate the others.`,
            )
          }
          image = await imagePartToVeoImage(part, this.allowUrlFetch)
          break
        }
        case 'mask':
        case 'control':
          throw new Error(
            `${this.name}: unsupported image role "${role}" for Veo video generation.`,
          )
      }
    }

    return { image, lastFrame, referenceImages }
  }

  async getVideoStatus(jobId: string): Promise<VideoStatusResult> {
    if (isInteractionsVideoModel(this.model)) {
      return await this.getInteractionsVideoStatus(jobId)
    }
    const operation = await this.getOperation(jobId)

    if (!operation.done) {
      return { jobId, status: 'processing' }
    }

    if (operation.error) {
      return {
        jobId,
        status: 'failed',
        error: operationErrorMessage(operation.error),
      }
    }

    // The operation can finish "successfully" with every sample dropped by
    // Responsible-AI filters — surface that as a failure instead of letting
    // getVideoUrl() throw on an empty response.
    const videos = operation.response?.generatedVideos ?? []
    if (videos.length === 0) {
      const reasons = operation.response?.raiMediaFilteredReasons
      return {
        jobId,
        status: 'failed',
        error: reasons?.length
          ? `Video was filtered by Responsible-AI: ${reasons.join('; ')}`
          : 'Veo returned no generated videos.',
      }
    }

    return { jobId, status: 'completed' }
  }

  /**
   * Poll an Omni background interaction. `in_progress` maps to
   * 'processing'; a `completed` interaction with no video content (e.g.
   * filtered output) is surfaced as a failure so `getVideoUrl` doesn't
   * throw on an empty response. `requires_action` also fails: the adapter
   * never sends tools, so it can only arise via
   * `previous_interaction_id` chaining onto a tool-bearing interaction —
   * and such an interaction never progresses without a client response,
   * so polling it would spin until timeout.
   */
  private async getInteractionsVideoStatus(
    jobId: string,
  ): Promise<VideoStatusResult> {
    const interaction = await this.getInteraction(jobId)
    const status = interaction.status

    if (status === 'in_progress') {
      return { jobId, status: 'processing' }
    }
    if (status === 'requires_action') {
      return {
        jobId,
        status: 'failed',
        error:
          'Gemini Omni interaction is waiting on a client action (tool response), which the video jobs flow does not support.',
      }
    }
    if (status === 'completed') {
      if (!extractInteractionVideo(interaction)) {
        return {
          jobId,
          status: 'failed',
          error:
            'Gemini Omni completed the interaction without returning a video (the output may have been filtered).',
        }
      }
      return { jobId, status: 'completed' }
    }
    return {
      jobId,
      status: 'failed',
      error: `Gemini Omni video generation ended with status "${status}".`,
    }
  }

  async getVideoUrl(jobId: string): Promise<VideoUrlResult> {
    if (isInteractionsVideoModel(this.model)) {
      return await this.getInteractionsVideoUrl(jobId)
    }
    const operation = await this.getOperation(jobId)

    if (!operation.done) {
      throw new Error(
        `Video is not ready yet. Check status first. Job ID: ${jobId}`,
      )
    }

    if (operation.error) {
      throw new Error(
        `Video generation failed: ${operationErrorMessage(operation.error)}`,
      )
    }

    const uri = operation.response?.generatedVideos?.[0]?.video?.uri
    if (!uri) {
      const reasons = operation.response?.raiMediaFilteredReasons
      throw new Error(
        reasons?.length
          ? `Video was filtered by Responsible-AI: ${reasons.join('; ')}`
          : `Video URL not found in operation response. Job ID: ${jobId}`,
      )
    }

    return { jobId, url: uri }
  }

  /**
   * Extract the finished Omni video. Inline base64 output (the API default)
   * becomes a `data:` URL — matching the OpenAI Sora adapter's inline
   * delivery — and URI delivery passes through (Files API URIs need the API
   * key to download, like Veo). Usage carries the video-modality output
   * tokens (Omni bills per second of video, reported as tokens).
   */
  private async getInteractionsVideoUrl(
    jobId: string,
  ): Promise<VideoUrlResult> {
    const interaction = await this.getInteraction(jobId)
    const status = interaction.status

    if (status === 'in_progress') {
      throw new Error(
        `Video is not ready yet. Check status first. Job ID: ${jobId}`,
      )
    }
    if (status !== 'completed') {
      throw new Error(
        `Video generation failed: Gemini Omni interaction ended with status "${status}". Job ID: ${jobId}`,
      )
    }

    const video = extractInteractionVideo(interaction)
    if (!video) {
      throw new Error(
        `Video not found in interaction response (the output may have been filtered). Job ID: ${jobId}`,
      )
    }

    const usage = interactionUsageToTokenUsage(interaction.usage)
    const url = video.uri ?? `data:${video.mimeType};base64,${video.data}`
    return { jobId, url, ...(usage && { usage }) }
  }

  override availableDurations(): DurationOptions<
    GeminiVideoModelDurationByName[TModel]
  > {
    return getGeminiVideoDurationOptions(this.model)
  }

  override snapDuration(
    seconds: number,
  ): GeminiVideoModelDurationByName[TModel] | undefined {
    return snapToDurationOption(seconds, this.availableDurations())
  }

  /**
   * Fetch the long-running operation by name. The SDK's
   * `operations.getVideosOperation` needs a real `GenerateVideosOperation`
   * instance (it calls `_fromAPIResponse` on it), so reconstruct one from
   * the job ID rather than passing an object literal.
   */
  private async getOperation(jobId: string): Promise<GenerateVideosOperation> {
    const operation = new GenerateVideosOperation()
    operation.name = jobId
    return await this.client.operations.getVideosOperation({ operation })
  }

  /**
   * Fetch an Omni background interaction by id.
   */
  private async getInteraction(jobId: string): Promise<Interaction> {
    return await this.client.interactions.get(jobId)
  }
}

/**
 * Creates a Gemini video adapter with an explicit API key.
 * Type resolution happens here at the call site.
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * @param model - The model name (e.g., 'veo-3.1-generate-preview')
 * @param apiKey - Your Google API key
 * @param config - Optional additional configuration
 * @returns Configured Gemini video adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createGeminiVideo('veo-3.1-generate-preview', 'your-api-key');
 *
 * const { jobId } = await generateVideo({
 *   adapter,
 *   prompt: 'A beautiful sunset over the ocean',
 *   duration: adapter.snapDuration(7), // → 6
 * });
 * ```
 */
export function createGeminiVideo<TModel extends GeminiVideoModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GeminiVideoConfig, 'apiKey'>,
): GeminiVideoAdapter<TModel> {
  return new GeminiVideoAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Gemini video adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `GOOGLE_API_KEY` or `GEMINI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * @param model - The model name (e.g., 'veo-3.1-generate-preview')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Gemini video adapter instance with resolved types
 * @throws Error if GOOGLE_API_KEY or GEMINI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses GOOGLE_API_KEY from environment
 * const adapter = geminiVideo('veo-3.1-generate-preview');
 *
 * // Create a video generation job
 * const { jobId } = await generateVideo({
 *   adapter,
 *   prompt: 'A cat playing piano'
 * });
 *
 * // Poll for status
 * const status = await getVideoJobStatus({ adapter, jobId });
 * ```
 */
export function geminiVideo<TModel extends GeminiVideoModel>(
  model: TModel,
  config?: Omit<GeminiVideoConfig, 'apiKey'>,
): GeminiVideoAdapter<TModel> {
  const apiKey = getGeminiApiKeyFromEnv()
  return createGeminiVideo(model, apiKey, config)
}
