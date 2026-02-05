import { createServerFn } from '@tanstack/react-start'
import { createFalImage, createFalVideo } from '@tanstack/ai-fal'

export const generateImage = createServerFn({ method: 'POST' })
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
        const adapter = createFalImage('fal-ai/nano-banana-pro')
        return adapter.generateImages({
          prompt: data.prompt,
          numberOfImages: 1,
          modelOptions: {
            aspect_ratio: '16:9',
            resolution: '4K',
            output_format: 'jpeg',
          },
        })
      }
      case 'xai/grok-imagine-image': {
        const adapter = createFalImage('xai/grok-imagine-image')
        return adapter.generateImages({
          prompt: data.prompt,
          numberOfImages: 1,
          modelOptions: { aspect_ratio: '16:9' },
        })
      }
      case 'fal-ai/flux-2/klein/9b': {
        const adapter = createFalImage('fal-ai/flux-2/klein/9b')
        return adapter.generateImages({
          prompt: data.prompt,
          numberOfImages: 1,
          modelOptions: { aspect_ratio: '16:9' },
        })
      }
      case 'fal-ai/z-image/turbo': {
        const adapter = createFalImage('fal-ai/z-image/turbo')
        return adapter.generateImages({
          prompt: data.prompt,
          numberOfImages: 1,
          modelOptions: {
            acceleration: 'high',
            enable_prompt_expansion: true,
            image_size: 'landscape_16_9',
          },
        })
      }
      default:
        throw new Error(`Unknown model: ${data.model}`)
    }
  })

function createVideoAdapter(model: string) {
  switch (model) {
    case 'fal-ai/kling-video/v2.6/pro/text-to-video':
      return createFalVideo('fal-ai/kling-video/v2.6/pro/text-to-video')
    case 'fal-ai/kling-video/v2.6/pro/image-to-video':
      return createFalVideo('fal-ai/kling-video/v2.6/pro/image-to-video')
    case 'fal-ai/veo3.1':
      return createFalVideo('fal-ai/veo3.1')
    case 'fal-ai/veo3.1/image-to-video':
      return createFalVideo('fal-ai/veo3.1/image-to-video')
    case 'xai/grok-imagine-video/text-to-video':
      return createFalVideo('xai/grok-imagine-video/text-to-video')
    case 'xai/grok-imagine-video/image-to-video':
      return createFalVideo('xai/grok-imagine-video/image-to-video')
    case 'fal-ai/ltx-2/text-to-video/fast':
      return createFalVideo('fal-ai/ltx-2/text-to-video/fast')
    case 'fal-ai/ltx-2/image-to-video/fast':
      return createFalVideo('fal-ai/ltx-2/image-to-video/fast')
    default:
      throw new Error(`Unknown video model: ${model}`)
  }
}

export const createVideoJob = createServerFn({ method: 'POST' })
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
        const adapter = createFalVideo(
          'fal-ai/kling-video/v2.6/pro/text-to-video',
        )
        // NOTE newer models are untyped
        return adapter.createVideoJob({
          prompt: data.prompt,
          modelOptions: {
            aspect_ratio: '16:9',
            resolution: '1080p',
            duration: '5',
          },
        })
      }
      case 'fal-ai/veo3.1': {
        const adapter = createFalVideo('fal-ai/veo3.1')
        // NOTE pass aspect ratio, resolution, and duration in model options
        // This makes use of existing types and avoids type errors
        return adapter.createVideoJob({
          prompt: data.prompt,
          modelOptions: {
            aspect_ratio: '16:9',
            resolution: '1080p',
            duration: '4s',
          },
        })
      }
      case 'xai/grok-imagine-video/text-to-video': {
        const adapter = createFalVideo('xai/grok-imagine-video/text-to-video')
        return adapter.createVideoJob({
          prompt: data.prompt,
          modelOptions: {
            aspect_ratio: '16:9',
            resolution: '720p',
            duration: '5',
          },
        })
      }
      case 'fal-ai/ltx-2/text-to-video/fast': {
        const adapter = createFalVideo('fal-ai/ltx-2/text-to-video/fast')
        // NOTE model options are fully typed
        return adapter.createVideoJob({
          prompt: data.prompt,
          modelOptions: {
            aspect_ratio: '16:9',
            resolution: '2160p',
          },
        })
      }
      // Image-to-video models
      case 'fal-ai/kling-video/v2.6/pro/image-to-video': {
        if (!data.imageUrl)
          throw new Error('Image URL is required for image-to-video')
        const adapter = createFalVideo(
          'fal-ai/kling-video/v2.6/pro/image-to-video',
        )
        // NOTE for newer models model options are Record<string, any>
        return adapter.createVideoJob({
          prompt: data.prompt,
          modelOptions: {
            start_image_url: data.imageUrl,
            generate_audio: true,

            duration: '5',
          },
        })
      }
      case 'fal-ai/veo3.1/image-to-video': {
        if (!data.imageUrl)
          throw new Error('Image URL is required for image-to-video')
        const adapter = createFalVideo('fal-ai/veo3.1/image-to-video')
        return adapter.createVideoJob({
          prompt: data.prompt,
          modelOptions: {
            image_url: data.imageUrl,
            aspect_ratio: '16:9',
            resolution: '1080p',
            duration: '4s',
          },
        })
      }
      case 'xai/grok-imagine-video/image-to-video': {
        if (!data.imageUrl)
          throw new Error('Image URL is required for image-to-video')
        const adapter = createFalVideo('xai/grok-imagine-video/image-to-video')
        return adapter.createVideoJob({
          prompt: data.prompt,
          modelOptions: {
            image_url: data.imageUrl,
            aspect_ratio: '16:9',
            resolution: '720p',
            duration: '5',
          },
        })
      }
      case 'fal-ai/ltx-2/image-to-video/fast': {
        if (!data.imageUrl)
          throw new Error('Image URL is required for image-to-video')
        const adapter = createFalVideo('fal-ai/ltx-2/image-to-video/fast')
        return await adapter.createVideoJob({
          prompt: data.prompt,
          modelOptions: {
            image_url: data.imageUrl,
            resolution: '2160p',
          },
        })
      }
      default:
        throw new Error(`Unknown video model: ${data.model}`)
    }
  })

export const getVideoStatus = createServerFn({ method: 'GET' })
  .inputValidator((data: { jobId: string; model: string }) => data)
  .handler(async ({ data }) => {
    const adapter = createVideoAdapter(data.model)
    return adapter.getVideoStatus(data.jobId)
  })

export const getVideoUrl = createServerFn({ method: 'GET' })
  .inputValidator((data: { jobId: string; model: string }) => data)
  .handler(async ({ data }) => {
    const adapter = createVideoAdapter(data.model)
    return adapter.getVideoUrl(data.jobId)
  })
