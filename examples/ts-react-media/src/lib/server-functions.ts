import { createServerFn } from '@tanstack/react-start'
import { falImage, falVideo } from '@tanstack/ai-fal'
import { geminiImage } from '@tanstack/ai-gemini'
import { grokImage, grokVideo } from '@tanstack/ai-grok'
import { generateImage, generateVideo, getVideoJobStatus } from '@tanstack/ai'

import type {
  ImagePart,
  MediaInputMetadata,
  MediaPrompt,
  TextPart,
} from '@tanstack/ai/client'

/** A prompt restricted to text — accepted by every (incl. text-only) model. */
type TextPrompt = string | Array<TextPart>
/** A prompt of text + image parts — accepted by image-conditioned models. */
type ImagePrompt = string | Array<TextPart | ImagePart<MediaInputMetadata>>

/** True when the prompt carries text — a non-empty string or any prompt part. */
function hasPromptContent(prompt: MediaPrompt): boolean {
  return typeof prompt === 'string'
    ? prompt.trim().length > 0
    : prompt.length > 0
}

/**
 * Narrows a wire `MediaPrompt` to a text + image prompt for image-conditioned
 * models, throwing on any other part kind (video/audio) so unsupported inputs
 * fail fast rather than being silently dropped.
 */
function asImagePrompt(prompt: MediaPrompt): ImagePrompt {
  if (typeof prompt === 'string') return prompt
  return prompt.map((part) => {
    if (part.type === 'text' || part.type === 'image') return part
    throw new Error(`Unsupported prompt part for image model: ${part.type}`)
  })
}

/**
 * Narrows a wire `MediaPrompt` to a text-only prompt, throwing if any image /
 * video / audio part is present (text-to-image models can't accept inputs).
 */
function asTextPrompt(prompt: MediaPrompt): TextPrompt {
  if (typeof prompt === 'string') return prompt
  return prompt.map((part) => {
    if (part.type === 'text') return part
    throw new Error(
      `Model does not support image inputs (received ${part.type} part)`,
    )
  })
}

/**
 * Like `asImagePrompt`, but additionally requires at least one image part —
 * image-to-video endpoints need a start frame.
 */
function asImageToVideoPrompt(
  prompt: MediaPrompt,
): Array<TextPart | ImagePart<MediaInputMetadata>> {
  const narrowed = asImagePrompt(prompt)
  if (
    typeof narrowed === 'string' ||
    !narrowed.some((part) => part.type === 'image')
  ) {
    throw new Error('Start image is required for image-to-video')
  }
  return narrowed
}

/**
 * Resolves the video adapter for a UI model id. The native grok-imagine
 * entries hit xAI's Imagine API directly via the `grokVideo` adapter
 * (XAI_API_KEY); everything else is a fal-hosted model.
 */
function videoAdapterForModel(model: string) {
  if (model === 'grok-imagine-video') {
    return grokVideo('grok-imagine-video')
  }
  if (model === 'grok-imagine-video-1.5/image-to-video') {
    return grokVideo('grok-imagine-video-1.5')
  }
  return falVideo(model)
}

export const generateImageFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { prompt: MediaPrompt; model: string }) => {
    if (!hasPromptContent(data.prompt)) throw new Error('Prompt is required')
    if (!data.model) throw new Error('Model is required')
    return data
  })
  .handler(async ({ data }) => {
    // NOTE: Use string literals when instantiating adapters to preserve type safety
    // The Fal adapater also accepts any string for very latest models which is why new models appear to accept any paramater
    // Pass size information in modelOptions for the Fal adapter instead of size to be sure you are using the correct resolution

    switch (data.model) {
      case 'fal-ai/nano-banana-pro': {
        return generateImage({
          adapter: falImage('fal-ai/nano-banana-pro'),
          prompt: asTextPrompt(data.prompt),
          numberOfImages: 1,
          size: '16:9_4K',
          modelOptions: {
            output_format: 'jpeg',
          },
        })
      }
      case 'xai/grok-imagine-image': {
        // NOTE: fal's generated `size` type for this model only offers
        // `16:9_1K` / `16:9_4K`, but the live API rejects those resolutions
        // ("Input should be '1k' or '2k'") — fal's published enum is out of
        // sync with its API, so `'16:9_4K'` type-checks yet 422s at runtime.
        // Pass aspect_ratio via modelOptions and let the endpoint pick its
        // default resolution, which both type-checks and works at runtime.
        return generateImage({
          adapter: falImage('xai/grok-imagine-image'),
          prompt: asTextPrompt(data.prompt),
          numberOfImages: 1,
          modelOptions: { aspect_ratio: '16:9' },
        })
      }
      case 'grok-imagine-image': {
        // Direct xAI Imagine API (XAI_API_KEY) via the native grokImage
        // adapter — no fal in between. The grok-imagine models accept image
        // prompt parts for image-conditioned generation, so we narrow with
        // asImagePrompt. Sizing uses the aspect-ratio template.
        return generateImage({
          adapter: grokImage('grok-imagine-image'),
          prompt: asImagePrompt(data.prompt),
          numberOfImages: 1,
          size: '16:9',
        })
      }
      case 'grok-imagine-image-quality': {
        return generateImage({
          adapter: grokImage('grok-imagine-image-quality'),
          prompt: asImagePrompt(data.prompt),
          numberOfImages: 1,
          size: '16:9',
        })
      }
      case 'fal-ai/flux-2/klein/9b': {
        // NOTE: Newer models are untyped (at the moment)
        return generateImage({
          adapter: falImage('fal-ai/flux-2/klein/9b'),
          prompt: asTextPrompt(data.prompt),
          numberOfImages: 1,
          size: 'landscape_16_9',
        })
      }
      case 'fal-ai/z-image/turbo': {
        return generateImage({
          adapter: falImage('fal-ai/z-image/turbo'),
          prompt: asTextPrompt(data.prompt),
          numberOfImages: 1,
          size: 'landscape_16_9',
          modelOptions: {
            acceleration: 'high',
            enable_prompt_expansion: true,
          },
        })
      }
      case 'gemini-3.1-flash-image-preview': {
        return generateImage({
          adapter: geminiImage('gemini-3.1-flash-image-preview'),
          prompt: asImagePrompt(data.prompt),
          numberOfImages: 1,
          size: '16:9_4K',
        })
      }
      case 'gemini-3-pro-image-preview': {
        return generateImage({
          adapter: geminiImage('gemini-3-pro-image-preview'),
          prompt: asImagePrompt(data.prompt),
          numberOfImages: 1,
          size: '16:9_4K',
        })
      }
      case 'imagen-4.0-ultra-generate-001': {
        return generateImage({
          adapter: geminiImage('imagen-4.0-ultra-generate-001'),
          prompt: asTextPrompt(data.prompt),
          numberOfImages: 1,
          size: '1024x1024',
        })
      }
      case 'imagen-4.0-generate-001': {
        return generateImage({
          adapter: geminiImage('imagen-4.0-generate-001'),
          prompt: asTextPrompt(data.prompt),
          numberOfImages: 1,
          size: '1024x1024',
        })
      }
      case 'imagen-4.0-fast-generate-001': {
        return generateImage({
          adapter: geminiImage('imagen-4.0-fast-generate-001'),
          prompt: asTextPrompt(data.prompt),
          numberOfImages: 1,
          size: '1024x1024',
        })
      }
      default:
        throw new Error(`Unknown model: ${data.model}`)
    }
  })

export const createVideoJobFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { prompt: MediaPrompt; model: string }) => {
    if (!hasPromptContent(data.prompt)) throw new Error('Prompt is required')
    if (!data.model) throw new Error('Model is required')
    return data
  })
  .handler(async ({ data }) => {
    // Image-to-video models receive the start frame as a prompt part
    // (role: 'start_frame') — the fal adapter routes it to the endpoint's
    // start-image field. Text-to-video models take the text prompt only.
    switch (data.model) {
      // Text-to-video models
      case 'fal-ai/kling-video/v3/pro/text-to-video': {
        return generateVideo({
          adapter: falVideo('fal-ai/kling-video/v3/pro/text-to-video'),
          prompt: asTextPrompt(data.prompt),
          size: '16:9',
          modelOptions: {
            duration: '5',
          },
        })
      }
      case 'fal-ai/veo3.1': {
        // NOTE pass aspect ratio, resolution, and duration in model options
        // This makes use of existing types and avoids type errors
        return generateVideo({
          adapter: falVideo('fal-ai/veo3.1'),
          prompt: asTextPrompt(data.prompt),
          size: '16:9_1080p',
          modelOptions: {
            duration: '4s',
          },
        })
      }
      case 'xai/grok-imagine-video/text-to-video': {
        return generateVideo({
          adapter: falVideo('xai/grok-imagine-video/text-to-video'),
          prompt: asTextPrompt(data.prompt),
          size: '16:9_720p',
          modelOptions: {
            duration: 5,
          },
        })
      }
      case 'grok-imagine-video': {
        // Direct xAI Imagine API (XAI_API_KEY) — no fal in between. The base
        // grok-imagine-video (v1.0) supports text-to-video; durations are
        // 1-15 integer seconds. Completed jobs report usage.billed
        // ({ quantity, unit: 'seconds' }) and usage.cost (exact USD).
        return generateVideo({
          adapter: grokVideo('grok-imagine-video'),
          prompt: asTextPrompt(data.prompt),
          size: '16:9_720p',
          duration: 5,
        })
      }
      case 'fal-ai/ltx-2.3/text-to-video/fast': {
        return generateVideo({
          adapter: falVideo('fal-ai/ltx-2.3/text-to-video/fast'),
          prompt: asTextPrompt(data.prompt),
          size: '16:9_2160p',
        })
      }
      // Image-to-video models
      case 'fal-ai/kling-video/v3/pro/image-to-video': {
        return generateVideo({
          adapter: falVideo('fal-ai/kling-video/v3/pro/image-to-video'),
          prompt: asImageToVideoPrompt(data.prompt),
          modelOptions: {
            generate_audio: true,
            duration: '5',
          },
        })
      }
      case 'fal-ai/veo3.1/image-to-video': {
        return generateVideo({
          adapter: falVideo('fal-ai/veo3.1/image-to-video'),
          prompt: asImageToVideoPrompt(data.prompt),
          size: '16:9_1080p',
          modelOptions: {
            duration: '4s',
          },
        })
      }
      case 'xai/grok-imagine-video/image-to-video': {
        return generateVideo({
          adapter: falVideo('xai/grok-imagine-video/image-to-video'),
          prompt: asImageToVideoPrompt(data.prompt),
          size: '16:9_720p',
          modelOptions: {
            duration: 5,
          },
        })
      }
      case 'grok-imagine-video-1.5/image-to-video': {
        // Direct xAI Imagine API. The starting frame is supplied as an image
        // prompt part (asImageToVideoPrompt requires one); the grokVideo
        // adapter forwards it to the Imagine endpoint as the start frame.
        return generateVideo({
          adapter: grokVideo('grok-imagine-video-1.5'),
          prompt: asImageToVideoPrompt(data.prompt),
          size: '16:9_720p',
          duration: 5,
        })
      }
      case 'fal-ai/ltx-2.3/image-to-video/fast': {
        return generateVideo({
          adapter: falVideo('fal-ai/ltx-2.3/image-to-video/fast'),
          prompt: asImageToVideoPrompt(data.prompt),
          size: '16:9_2160p',
        })
      }
      default:
        throw new Error(`Unknown video model: ${data.model}`)
    }
  })

export const getVideoStatusFn = createServerFn({ method: 'GET' })
  .inputValidator((data: { jobId: string; model: string }) => data)
  .handler(async ({ data }) => {
    const adapter = videoAdapterForModel(data.model)
    return await getVideoJobStatus({
      adapter,
      jobId: data.jobId,
    })
  })

export const getVideoUrlFn = createServerFn({ method: 'GET' })
  .inputValidator((data: { jobId: string; model: string }) => data)
  .handler(async ({ data }) => {
    const adapter = videoAdapterForModel(data.model)
    return await getVideoJobStatus({
      adapter,
      jobId: data.jobId,
    })
  })
