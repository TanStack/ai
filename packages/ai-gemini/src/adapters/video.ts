import {
  GenerateVideosOperation,
  VideoGenerationReferenceType,
} from '@google/genai'
import { resolveMediaPrompt } from '@tanstack/ai'
import { BaseVideoAdapter, snapToDurationOption } from '@tanstack/ai/adapters'
import { arrayBufferToBase64 } from '@tanstack/ai-utils'
import { createGeminiClient, getGeminiApiKeyFromEnv } from '../utils'
import { getGeminiVideoDurationOptions } from '../video/video-provider-options'
import type { DurationOptions } from '@tanstack/ai/adapters'
import type {
  ImagePart,
  MediaInputMetadata,
  VideoGenerationOptions,
  VideoJobResult,
  VideoStatusResult,
  VideoUrlResult,
} from '@tanstack/ai'
import type {
  GenerateVideosConfig,
  GoogleGenAI,
  Image,
  VideoGenerationReferenceImage,
} from '@google/genai'
import type {
  GeminiVideoModel,
  GeminiVideoModelDurationByName,
  GeminiVideoModelInputModalitiesByName,
  GeminiVideoModelProviderOptionsByName,
  GeminiVideoModelSizeByName,
  GeminiVideoProviderOptions,
  GeminiVideoSize,
} from '../video/video-provider-options'
import type { GeminiClientConfig } from '../utils'

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
 * Gemini Veo Video Generation Adapter
 *
 * Tree-shakeable adapter for Google Veo video generation. Veo runs as a
 * long-running operation: `createVideoJob` starts the operation via the
 * `:predictLongRunning` endpoint, `getVideoStatus` polls it, and
 * `getVideoUrl` extracts the generated video's URI once it completes.
 *
 * Image prompt parts are routed by `metadata.role`:
 * - `'start_frame'` (or the first un-roled image) → the input image the
 *   video starts from
 * - `'end_frame'` → `lastFrame` (the frame the video ends on)
 * - `'reference'` / `'character'` → `referenceImages` (asset references,
 *   Veo 3.1)
 *
 * Note: the returned video URI is served by the Gemini Files API and
 * requires the API key (`x-goog-api-key` header or `?key=` query
 * parameter) to download.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export class GeminiVideoAdapter<
  TModel extends GeminiVideoModel,
> extends BaseVideoAdapter<
  TModel,
  GeminiVideoProviderOptions,
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
      GeminiVideoProviderOptions,
      GeminiVideoSize,
      GeminiVideoModelDurationByName[TModel]
    >,
  ): Promise<VideoJobResult> {
    const { prompt, size, duration, modelOptions, logger } = options

    logger.request(
      `activity=video.create provider=${this.name} model=${this.model} size=${size ?? 'default'} duration=${duration ?? 'default'}`,
      { provider: this.name, model: this.model },
    )

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

  async getVideoUrl(jobId: string): Promise<VideoUrlResult> {
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
