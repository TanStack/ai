import { createServerFn } from '@tanstack/react-start'
import { falImage, falVideo } from '@tanstack/ai-fal'
import { generateImage, generateVideo, getVideoJobStatus } from '@tanstack/ai'

import type { FalModel } from '@tanstack/ai-fal'

export const generateImageFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { prompt: string; model: string }) => {
    if (!data.prompt.trim()) throw new Error('Prompt is required')
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
          prompt: data.prompt,
          numberOfImages: 1,
          size: '16:9_4K',
          modelOptions: {
            output_format: 'jpeg',
          },
        })
      }
      case 'xai/grok-imagine-image': {
        // NOTE: Newer models are untyped (at the moment)
        return generateImage({
          adapter: falImage('xai/grok-imagine-image'),
          prompt: data.prompt,
          numberOfImages: 1,
          size: '16:9',
        })
      }
      case 'fal-ai/flux-2/klein/9b': {
        // NOTE: Newer models are untyped (at the moment)
        return generateImage({
          adapter: falImage('fal-ai/flux-2/klein/9b'),
          prompt: data.prompt,
          numberOfImages: 1,
          size: '16:9',
        })
      }
      case 'fal-ai/z-image/turbo': {
        return generateImage({
          adapter: falImage('fal-ai/z-image/turbo'),
          prompt: data.prompt,
          numberOfImages: 1,
          size: 'landscape_16_9',
          modelOptions: {
            acceleration: 'high',
            enable_prompt_expansion: true,
          },
        })
      }
      default:
        throw new Error(`Unknown model: ${data.model}`)
    }
  })

export const createVideoJobFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { prompt: string; model: string; imageUrl?: string }) => {
      if (!data.prompt.trim()) throw new Error('Prompt is required')
      if (!data.model) throw new Error('Model is required')
      return data
    },
  )
  .handler(async ({ data }) => {
    switch (data.model) {
      // Text-to-video models
      case 'fal-ai/kling-video/v2.6/pro/text-to-video': {
        // NOTE newer models are untyped
        return generateVideo({
          adapter: falVideo('fal-ai/kling-video/v2.6/pro/text-to-video'),
          prompt: data.prompt,
          size: '16:9_1080p',
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
          prompt: data.prompt,
          size: '16:9_1080p',
          modelOptions: {
            duration: '4s',
          },
        })
      }
      case 'xai/grok-imagine-video/text-to-video': {
        return generateVideo({
          adapter: falVideo('xai/grok-imagine-video/text-to-video'),
          prompt: data.prompt,
          size: '16:9_720p',
          modelOptions: {
            duration: '5',
          },
        })
      }
      case 'fal-ai/ltx-2/text-to-video/fast': {
        return generateVideo({
          adapter: falVideo('fal-ai/ltx-2/text-to-video/fast'),
          prompt: data.prompt,
          size: '16:9_2160p',
        })
      }
      // Image-to-video models
      case 'fal-ai/kling-video/v2.6/pro/image-to-video': {
        if (!data.imageUrl)
          throw new Error('Image URL is required for image-to-video')
        return generateVideo({
          adapter: falVideo('fal-ai/kling-video/v2.6/pro/image-to-video'),
          prompt: data.prompt,
          modelOptions: {
            start_image_url: data.imageUrl,
            generate_audio: true,
            duration: '5',
          },
        })
      }
      case 'fal-ai/veo3.1/image-to-video': {
        if (!data.imageUrl) {
          throw new Error('Image URL is required for image-to-video')
        }
        return generateVideo({
          adapter: falVideo('fal-ai/veo3.1/image-to-video'),
          prompt: data.prompt,
          size: '16:9_1080p',
          modelOptions: {
            image_url: data.imageUrl,
            duration: '4s',
          },
        })
      }
      case 'xai/grok-imagine-video/image-to-video': {
        if (!data.imageUrl)
          throw new Error('Image URL is required for image-to-video')
        return generateVideo({
          adapter: falVideo('xai/grok-imagine-video/image-to-video'),
          prompt: data.prompt,
          size: '16:9_720p',
          modelOptions: {
            image_url: data.imageUrl,
            duration: '5',
          },
        })
      }
      case 'fal-ai/ltx-2/image-to-video/fast': {
        if (!data.imageUrl)
          throw new Error('Image URL is required for image-to-video')
        return generateVideo({
          adapter: falVideo('fal-ai/ltx-2/image-to-video/fast'),
          prompt: data.prompt,
          size: '16:9_2160p',
          modelOptions: {
            image_url: data.imageUrl,
          },
        })
      }
      default:
        throw new Error(`Unknown video model: ${data.model}`)
    }
  })

export const getVideoStatusFn = createServerFn({ method: 'GET' })
  .inputValidator((data: { jobId: string; model: FalModel }) => data)
  .handler(async ({ data }) => {
    const adapter = falVideo(data.model)
    return await getVideoJobStatus({
      adapter,
      jobId: data.jobId,
    })
  })

export const getVideoUrlFn = createServerFn({ method: 'GET' })
  .inputValidator((data: { jobId: string; model: string }) => data)
  .handler(async ({ data }) => {
    const adapter = falVideo(data.model)
    return await getVideoJobStatus({
      adapter,
      jobId: data.jobId,
    })
  })
