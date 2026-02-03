import { createServerFn } from '@tanstack/react-start'
import { createFalImage, createFalVideo } from '@tanstack/ai-fal'

export const generateImage = createServerFn({ method: 'POST' })
  .inputValidator((data: { prompt: string; model: string }) => {
    if (!data.prompt.trim()) throw new Error('Prompt is required')
    if (!data.model) throw new Error('Model is required')
    return data
  })
  .handler(async ({ data }) => {
    switch (data.model) {
      case 'fal-ai/nano-banana-pro': {
        const adapter = createFalImage('fal-ai/nano-banana-pro')
        return adapter.generateImages({
          prompt: data.prompt,
          numberOfImages: 1,
          size: 'landscape_16_9',
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
          size: 'landscape_16_9',
        })
      }
      case 'fal-ai/z-image/turbo': {
        const adapter = createFalImage('fal-ai/z-image/turbo')
        return adapter.generateImages({
          prompt: data.prompt,
          numberOfImages: 1,
          size: 'landscape_16_9',
        })
      }
      default:
        throw new Error(`Unknown model: ${data.model}`)
    }
  })

export const createVideoJob = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { prompt: string; model: string; imageUrl?: string }) => {
      if (!data.prompt.trim()) throw new Error('Prompt is required')
      if (!data.model) throw new Error('Model is required')
      return data
    },
  )
  .handler(async ({ data }) => {
    const adapter = createFalVideo(data.model)

    const isImageToVideo =
      data.model.includes('image-to-video') || data.imageUrl

    return adapter.createVideoJob({
      model: data.model,
      prompt: data.prompt,
      size: '1920x1080',
      duration: 5,
      modelOptions: isImageToVideo ? { image_url: data.imageUrl } : undefined,
    })
  })

export const getVideoStatus = createServerFn({ method: 'GET' })
  .inputValidator((data: { jobId: string; model: string }) => data)
  .handler(async ({ data }) => {
    const adapter = createFalVideo(data.model)
    return adapter.getVideoStatus(data.jobId)
  })

export const getVideoUrl = createServerFn({ method: 'GET' })
  .inputValidator((data: { jobId: string; model: string }) => data)
  .handler(async ({ data }) => {
    const adapter = createFalVideo(data.model)
    return adapter.getVideoUrl(data.jobId)
  })
