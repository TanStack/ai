export const IMAGE_MODELS = [
  {
    id: 'fal-ai/nano-banana-pro',
    name: 'Nano Banana Pro (4k)',
    description: 'Fast, high-quality image generation',
    defaultSize: 'landscape_16_9' as const,
    sizeType: 'standard' as const,
  },
  {
    id: 'xai/grok-imagine-image',
    name: 'Grok Imagine',
    description: 'xAI highly aesthetic images with prompt enhancement',
    defaultSize: '16:9' as const,
    sizeType: 'aspect_ratio' as const,
  },
  {
    id: 'fal-ai/flux-2/klein/9b',
    name: 'FLUX.2 Klein 9B',
    description: 'Enhanced realism, crisp text generation',
    defaultSize: 'landscape_16_9' as const,
    sizeType: 'standard' as const,
  },
  {
    id: 'fal-ai/z-image/turbo',
    name: 'Z-Image Turbo',
    description: 'Super fast 6B parameter model',
    defaultSize: 'landscape_16_9' as const,
    sizeType: 'standard' as const,
  },
] as const

export const VIDEO_MODELS = [
  {
    id: 'fal-ai/kling-video/v2.6/pro/text-to-video',
    name: 'Kling 2.6 Pro (Text-to-Video)',
    description: 'High-quality text-to-video generation',
    mode: 'text-to-video' as const,
  },
  {
    id: 'fal-ai/kling-video/v2.6/pro/image-to-video',
    name: 'Kling 2.6 Pro (Image-to-Video)',
    description: 'Animate images with Kling',
    mode: 'image-to-video' as const,
  },
  {
    id: 'fal-ai/veo3.1',
    name: 'Veo 3.1 (Text-to-Video)',
    description: 'Google Veo text-to-video',
    mode: 'text-to-video' as const,
  },
  {
    id: 'fal-ai/veo3.1/image-to-video',
    name: 'Veo 3.1 (Image-to-Video)',
    description: 'Google Veo image-to-video',
    mode: 'image-to-video' as const,
  },
  {
    id: 'xai/grok-imagine-video/text-to-video',
    name: 'Grok Imagine Video (Text-to-Video)',
    description: 'xAI video generation from text',
    mode: 'text-to-video' as const,
  },
  {
    id: 'xai/grok-imagine-video/image-to-video',
    name: 'Grok Imagine Video (Image-to-Video)',
    description: 'xAI animate images to video',
    mode: 'image-to-video' as const,
  },
  {
    id: 'fal-ai/ltx-2/text-to-video/fast',
    name: 'LTX-2 Fast (Text-to-Video)',
    description: 'Fast text-to-video generation',
    mode: 'text-to-video' as const,
  },
  {
    id: 'fal-ai/ltx-2/image-to-video/fast',
    name: 'LTX-2 Fast (Image-to-Video)',
    description: 'Fast image-to-video animation',
    mode: 'image-to-video' as const,
  },
] as const

export type ImageModel = (typeof IMAGE_MODELS)[number]
export type VideoModel = (typeof VIDEO_MODELS)[number]
export type VideoMode = 'text-to-video' | 'image-to-video'
