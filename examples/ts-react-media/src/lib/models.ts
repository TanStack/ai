import {
  REACTOR_VIDEO_MODELS,
  isReactorVideoModel,
  isReactorWorldModel,
} from '@tanstack/ai-reactor'
import { FAL_LIVE_APP, isFalLiveModel } from '@tanstack/ai-fal'
import type { ReactorVideoModel, ReactorWorldModel } from '@tanstack/ai-reactor'
import type { FalLiveModel } from '@tanstack/ai-fal'

export const IMAGE_MODELS = [
  {
    id: 'fal-ai/nano-banana-pro',
    name: 'Nano Banana Pro (4k)',
    description: 'Fast, high-quality image generation',
    defaultSize: 'landscape_16_9' as const,
    sizeType: 'standard' as const,
    provider: 'fal' as const,
  },
  {
    id: 'xai/grok-imagine-image',
    name: 'Grok Imagine',
    description: 'xAI highly aesthetic images with prompt enhancement',
    defaultSize: '16:9' as const,
    sizeType: 'aspect_ratio' as const,
    provider: 'fal' as const,
  },
  {
    id: 'grok-imagine-image',
    name: 'Grok Imagine (xAI Direct)',
    description: 'xAI Imagine API via the native grokImage adapter',
    defaultSize: '16:9' as const,
    sizeType: 'aspect_ratio' as const,
    provider: 'xai' as const,
  },
  {
    id: 'grok-imagine-image-2.0',
    name: 'Grok Imagine 2.0 (xAI Direct)',
    description: 'xAI recommended Imagine model with the quality option',
    defaultSize: '16:9' as const,
    sizeType: 'aspect_ratio' as const,
    provider: 'xai' as const,
  },
  {
    id: 'grok-imagine-image-quality',
    name: 'Grok Imagine Quality (xAI Direct)',
    description: 'Higher-quality xAI Imagine images via the native adapter',
    defaultSize: '16:9' as const,
    sizeType: 'aspect_ratio' as const,
    provider: 'xai' as const,
  },
  {
    id: 'fal-ai/flux-2/klein/9b',
    name: 'FLUX.2 Klein 9B',
    description: 'Enhanced realism, crisp text generation',
    defaultSize: 'landscape_16_9' as const,
    sizeType: 'standard' as const,
    provider: 'fal' as const,
  },
  {
    id: 'fal-ai/z-image/turbo',
    name: 'Z-Image Turbo',
    description: 'Super fast 6B parameter model',
    defaultSize: 'landscape_16_9' as const,
    sizeType: 'standard' as const,
    provider: 'fal' as const,
  },
  {
    id: 'gemini-3.1-flash-image',
    name: 'NanoBanana 2 (Gemini 3.1 Flash)',
    description: 'Latest and fastest Gemini native image generation',
    defaultSize: '16:9_4K' as const,
    sizeType: 'native' as const,
    provider: 'gemini' as const,
  },
  {
    id: 'gemini-3-pro-image',
    name: 'NanoBanana Pro (Gemini 3 Pro)',
    description: 'Higher quality Gemini native image generation',
    defaultSize: '16:9_4K' as const,
    sizeType: 'native' as const,
    provider: 'gemini' as const,
  },
  {
    id: 'imagen-4.0-ultra-generate-001',
    name: 'Imagen 4.0 Ultra',
    description: 'Best quality Imagen image generation',
    defaultSize: '1024x1024' as const,
    sizeType: 'standard' as const,
    provider: 'gemini' as const,
  },
  {
    id: 'imagen-4.0-generate-001',
    name: 'Imagen 4.0',
    description: 'High quality Imagen image generation',
    defaultSize: '1024x1024' as const,
    sizeType: 'standard' as const,
    provider: 'gemini' as const,
  },
  {
    id: 'imagen-4.0-fast-generate-001',
    name: 'Imagen 4.0 Fast',
    description: 'Fast Imagen image generation',
    defaultSize: '1024x1024' as const,
    sizeType: 'standard' as const,
    provider: 'gemini' as const,
  },
  {
    id: 'dola-seedream-5-0-pro-260628',
    name: 'Seedream 5.0 Pro',
    description:
      'BytePlus Seedream image generation, sized with a 1K/2K/4K token',
    defaultSize: '2K' as const,
    sizeType: 'standard' as const,
    provider: 'byteplus' as const,
  },
] as const

export const VIDEO_MODELS = [
  {
    id: 'fal-ai/kling-video/v3/pro/text-to-video',
    name: 'Kling 3 Pro (Text-to-Video)',
    description: 'High-quality text-to-video generation',
    mode: 'text-to-video' as const,
    provider: 'fal' as const,
  },
  {
    id: 'fal-ai/kling-video/v3/pro/image-to-video',
    name: 'Kling 3 Pro (Image-to-Video)',
    description: 'Animate images with Kling',
    mode: 'image-to-video' as const,
    provider: 'fal' as const,
  },
  {
    id: 'fal-ai/veo3.1',
    name: 'Veo 3.1 (Text-to-Video)',
    description: 'Google Veo text-to-video',
    mode: 'text-to-video' as const,
    provider: 'fal' as const,
  },
  {
    id: 'fal-ai/veo3.1/image-to-video',
    name: 'Veo 3.1 (Image-to-Video)',
    description: 'Google Veo image-to-video',
    mode: 'image-to-video' as const,
    provider: 'fal' as const,
  },
  {
    id: 'xai/grok-imagine-video/text-to-video',
    name: 'Grok Imagine Video (Text-to-Video)',
    description: 'xAI video generation from text',
    mode: 'text-to-video' as const,
    provider: 'fal' as const,
  },
  {
    id: 'xai/grok-imagine-video/image-to-video',
    name: 'Grok Imagine Video (Image-to-Video)',
    description: 'xAI animate images to video',
    mode: 'image-to-video' as const,
    provider: 'fal' as const,
  },
  {
    id: 'grok-imagine-video',
    name: 'Grok Imagine Video 1.0 (Text-to-Video)',
    description:
      'xAI Imagine API via the native grokVideo adapter (v1.0 supports text-to-video)',
    mode: 'text-to-video' as const,
    provider: 'xai' as const,
  },
  {
    id: 'grok-imagine-video-1.5',
    name: 'Grok Imagine Video 1.5 (Text-to-Video)',
    description:
      'xAI recommended video model via the native grokVideo adapter (native 1080p text-to-video)',
    mode: 'text-to-video' as const,
    provider: 'xai' as const,
  },
  {
    id: 'grok-imagine-video-1.5/image-to-video',
    name: 'Grok Imagine Video 1.5 (Image-to-Video)',
    description: 'Animate a starting frame via the native grokVideo adapter',
    mode: 'image-to-video' as const,
    provider: 'xai' as const,
  },
  {
    id: 'fal-ai/ltx-2.3/text-to-video/fast',
    name: 'LTX-2.3 Fast (Text-to-Video)',
    description: 'Fast text-to-video generation',
    mode: 'text-to-video' as const,
    provider: 'fal' as const,
  },
  {
    id: 'fal-ai/ltx-2.3/image-to-video/fast',
    name: 'LTX-2.3 Fast (Image-to-Video)',
    description: 'Fast image-to-video animation',
    mode: 'image-to-video' as const,
    provider: 'fal' as const,
  },
  {
    id: 'gemini-omni-1.1-flash',
    name: 'Gemini Omni 1.1 Flash (Text-to-Video)',
    description:
      'Google multimodal video generation with conversational editing, via the Interactions API (3-10s, 360p/720p/1080p/4k)',
    mode: 'text-to-video' as const,
    provider: 'gemini' as const,
  },
  {
    id: 'gemini-omni-1.1-flash/image-to-video',
    name: 'Gemini Omni 1.1 Flash (Image-to-Video)',
    description:
      'Animate an image with Gemini Omni 1.1 Flash via the Interactions API',
    mode: 'image-to-video' as const,
    provider: 'gemini' as const,
  },
  {
    id: 'dreamina-seedance-2-0-260128',
    name: 'Seedance 2.0 (Text-to-Video)',
    description:
      'BytePlus Seedance text-to-video (4-15s, 480p/720p/1080p/4k) via ModelArk',
    mode: 'text-to-video' as const,
    provider: 'byteplus' as const,
  },
  {
    id: 'bytedance/seedance-2.0',
    name: 'Seedance 2.0 (Text-to-Video, OpenRouter)',
    description:
      "OpenRouter's async video API; duration typed 4–15s with snapDuration()",
    mode: 'text-to-video' as const,
    provider: 'openrouter' as const,
  },
  {
    id: 'google/veo-3.1',
    name: 'Veo 3.1 (Image-to-Video, OpenRouter)',
    description:
      'OpenRouter async video; duration snaps to the nearest of 4/6/8s',
    mode: 'image-to-video' as const,
    provider: 'openrouter' as const,
  },
] as const

export type ImageModel = (typeof IMAGE_MODELS)[number]
export type VideoModel = (typeof VIDEO_MODELS)[number]
export type VideoMode = 'text-to-video' | 'image-to-video'

export type LiveVideoProvider = 'reactor' | 'fal'

export type LiveVideoModelId = ReactorVideoModel | FalLiveModel

export const LIVE_VIDEO_MODELS: ReadonlyArray<{
  id: LiveVideoModelId
  provider: LiveVideoProvider
}> = [
  ...REACTOR_VIDEO_MODELS.filter((id) => id !== 'ltx2').map((id) => ({
    id,
    provider: 'reactor' as const,
  })),
  { id: 'minimax/h3-max/director', provider: 'fal' },
]

export const LIVE_VIDEO_MODEL_LABELS: Record<LiveVideoModelId, string> = {
  helios: 'Helios (Reactor)',
  'fast-h3': 'FastH3 (Reactor)',
  'longlive-v2': 'LongLive 2 (Reactor)',
  ltx2: 'LTX (Reactor)',
  'minimax/h3-max/director': 'H3 Max Director (fal)',
}

export const LIVE_VIDEO_PROMPTS = [
  'Live shopping stream: a host holds up a gold watch to camera, studio lights, product close-up, talking to viewers.',
  'Fake news channel: an anchor at a glass desk, lower-thirds ticker, breaking-news sting, locked-off studio shot.',
  'A red sports car powerslides a mountain hairpin, gravel spraying, golden hour, helicopter tracking alongside.',
  'A chef tosses noodles in a steel wok, flames leaping, close-up, steam toward the lens.',
  'A violinist plays on a rain-soaked rooftop at night, city lights behind, slow push-in.',
] as const

export const REACTOR_LIVE_RESOLUTIONS = ['1080p', '2k', '4k'] as const
export const FAL_LIVE_RESOLUTIONS = ['480p', '768p'] as const

export type ReactorLiveResolution = (typeof REACTOR_LIVE_RESOLUTIONS)[number]
export type FalLiveResolution = (typeof FAL_LIVE_RESOLUTIONS)[number]
export type LiveVideoResolution = ReactorLiveResolution | FalLiveResolution

export function liveVideoProvider(model: LiveVideoModelId): LiveVideoProvider {
  return isFalLiveModel(model) ? 'fal' : 'reactor'
}

export function liveVideoResolutions(
  provider: LiveVideoProvider,
): ReadonlyArray<LiveVideoResolution> {
  return provider === 'fal' ? FAL_LIVE_RESOLUTIONS : REACTOR_LIVE_RESOLUTIONS
}

export function isLiveVideoModelId(value: string): value is LiveVideoModelId {
  return isReactorVideoModel(value) || isFalLiveModel(value)
}

export {
  FAL_LIVE_APP,
  isReactorVideoModel,
  isFalLiveModel,
  isReactorWorldModel,
}
export type { ReactorVideoModel, FalLiveModel, ReactorWorldModel }

export const WORLD_MODELS = [
  'visko-orbis-stable',
  'visko-orbis-dynamic',
  'lingbot-world-2',
  'lingbot',
  'helios',
] as const satisfies ReadonlyArray<ReactorWorldModel>

export const WORLD_MODEL_LABELS: Record<ReactorWorldModel, string> = {
  'visko-orbis-stable': 'Orbis Stable',
  'visko-orbis-dynamic': 'Orbis Dynamic',
  'happy-oyster-adventure': 'Happy Oyster (adventure)',
  'happy-oyster-director': 'Happy Oyster (director)',
  'lingbot-world-2': 'LingBot World 2',
  lingbot: 'LingBot',
  helios: 'Helios',
}

export const WORLD_PROMPTS = [
  'A black volcanic coastline at golden hour, tide pools, a cliff path you can keep walking.',
  'A neon rain-soaked city of alleys, markets, and towers you can wander at street level.',
  'A cedar forest at dawn, mist in the trees, a trail beside a stream.',
  'A desert canyon at noon, a dry riverbed between red rock walls, open sky above.',
  'A snowbound mountain village at dusk, lanterns in the windows, one main street.',
] as const

export const WORLD_RESOLUTIONS = REACTOR_LIVE_RESOLUTIONS

export type WorldResolution = (typeof WORLD_RESOLUTIONS)[number]

/**
 * Gemini Omni Flash task modes (`generation_config.video_config.task`).
 * Omit to let the model infer the mode from the prompt and attachments.
 */
export type OmniTaskMode =
  | 'text_to_video'
  | 'image_to_video'
  | 'reference_to_video'
  | 'edit'
