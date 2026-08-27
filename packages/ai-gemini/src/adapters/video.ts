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

export interface GeminiVideoConfig extends GeminiClientConfig {
  allowUrlFetch?: boolean
}

function operationErrorMessage(error: Record<string, unknown>): string {
  if (typeof error.message === 'string' && error.message.length > 0) {
    return error.message
  }
  return JSON.stringify(error)
}

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
    if (!match) {
      throw new Error(
        'gemini: only base64 data: URIs are supported for video image inputs.',
      )
    }
    if (!match[2]) {
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

  private async getOperation(jobId: string): Promise<GenerateVideosOperation> {
    const operation = new GenerateVideosOperation()
    operation.name = jobId
    return await this.client.operations.getVideosOperation({ operation })
  }

  private async getInteraction(jobId: string): Promise<Interaction> {
    return await this.client.interactions.get(jobId)
  }
}

export function createGeminiVideo<TModel extends GeminiVideoModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GeminiVideoConfig, 'apiKey'>,
): GeminiVideoAdapter<TModel> {
  return new GeminiVideoAdapter({ apiKey, ...config }, model)
}

export function geminiVideo<TModel extends GeminiVideoModel>(
  model: TModel,
  config?: Omit<GeminiVideoConfig, 'apiKey'>,
): GeminiVideoAdapter<TModel> {
  const apiKey = getGeminiApiKeyFromEnv()
  return createGeminiVideo(model, apiKey, config)
}
