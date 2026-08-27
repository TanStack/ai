import type { DurationOptions } from '@tanstack/ai/adapters'
import type { GrokVideoModel } from '../model-meta'

export type GrokVideoAspectRatio =
  | '1:1'
  | '16:9'
  | '9:16'
  | '4:3'
  | '3:4'
  | '3:2'
  | '2:3'

export type GrokVideoResolution = '480p' | '720p' | '1080p'

export type GrokVideoResolutionV1 = '480p' | '720p'

export type GrokVideoSize =
  | GrokVideoAspectRatio
  | `${GrokVideoAspectRatio}_${GrokVideoResolution}`

export type GrokVideoSizeV1 =
  | GrokVideoAspectRatio
  | `${GrokVideoAspectRatio}_${GrokVideoResolutionV1}`

const GROK_VIDEO_ASPECT_RATIOS: ReadonlyArray<string> = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
]

const GROK_VIDEO_RESOLUTIONS: ReadonlyArray<string> = ['480p', '720p', '1080p']

export const GROK_VIDEO_MIN_DURATION = 1
export const GROK_VIDEO_MAX_DURATION = 15

export function parseGrokVideoSize(
  size: string,
): { aspectRatio: string; resolution?: string } | undefined {
  const match = size.match(/^([\d.]+:[\d.]+)(?:_(.+))?$/)
  const [, aspectRatio, resolution] = match ?? []
  if (aspectRatio === undefined) return undefined
  return { aspectRatio, ...(resolution !== undefined && { resolution }) }
}

export function isGrokVideoNative1080pModel(model: string): boolean {
  return model === 'grok-imagine-video-1.5'
}

export function validateVideoSize(
  model: string,
  size?: string,
): asserts size is GrokVideoSize | undefined {
  if (size === undefined) return
  const parsed = parseGrokVideoSize(size)
  const sizeError =
    `Size "${size}" is not supported by model "${model}". Expected ` +
    `"aspectRatio" or "aspectRatio_resolution" (e.g. "16:9_720p") with ` +
    `aspect ratio one of: ${GROK_VIDEO_ASPECT_RATIOS.join(', ')}`
  if (!parsed) {
    throw new Error(sizeError)
  }
  if (!GROK_VIDEO_ASPECT_RATIOS.includes(parsed.aspectRatio)) {
    throw new Error(sizeError)
  }
  if (
    parsed.resolution !== undefined &&
    !GROK_VIDEO_RESOLUTIONS.includes(parsed.resolution)
  ) {
    throw new Error(
      `Resolution "${parsed.resolution}" is not supported by model "${model}". ` +
        `Supported resolutions: ${GROK_VIDEO_RESOLUTIONS.join(', ')}`,
    )
  }
  if (parsed.resolution === '1080p' && !isGrokVideoNative1080pModel(model)) {
    throw new Error(
      `Resolution "1080p" is not supported by model "${model}". ` +
        `Use 'grok-imagine-video-1.5' for native 1080p text-to-video / image-to-video.`,
    )
  }
}

export type GrokVideoModelDurationByName = {
  'grok-imagine-video': number
  'grok-imagine-video-1.5': number
}

export const GROK_VIDEO_DURATIONS: {
  readonly [TModel in GrokVideoModel]: DurationOptions<
    GrokVideoModelDurationByName[TModel]
  >
} = {
  'grok-imagine-video': {
    kind: 'range',
    min: GROK_VIDEO_MIN_DURATION,
    max: GROK_VIDEO_MAX_DURATION,
    step: 1,
    unit: 'seconds',
  },
  'grok-imagine-video-1.5': {
    kind: 'range',
    min: GROK_VIDEO_MIN_DURATION,
    max: GROK_VIDEO_MAX_DURATION,
    step: 1,
    unit: 'seconds',
  },
}

export function getGrokVideoDurationOptions<TModel extends GrokVideoModel>(
  model: TModel,
): DurationOptions<GrokVideoModelDurationByName[TModel]> {
  return GROK_VIDEO_DURATIONS[model]
}

export type GrokVideoMode = 'edit' | 'extend'

export interface GrokVideoBaseProviderOptions {
  aspect_ratio?: GrokVideoAspectRatio

  resolution?: GrokVideoResolution

  duration?: number
}

export interface GrokVideoSourceProviderOptions extends GrokVideoBaseProviderOptions {
  mode?: GrokVideoMode
}

export interface GrokVideoProviderOptions extends GrokVideoBaseProviderOptions {
  reference_images?: Array<{ url: string }>

  reference_audios?: Array<{ voice_id: string }>
}

export type GrokVideoRuntimeOptions = GrokVideoSourceProviderOptions &
  GrokVideoProviderOptions

export const GROK_VIDEO_MAX_REFERENCE_AUDIOS = 3

export const GROK_VIDEO_MAX_REFERENCE_IMAGES = 7

type GrokVideoReferenceModel = {
  [TModel in GrokVideoModel]: 'reference_images' extends keyof GrokVideoModelProviderOptionsByName[TModel]
    ? TModel
    : never
}[GrokVideoModel]

const GROK_VIDEO_REFERENCE_MODELS: ReadonlySet<string> =
  new Set<GrokVideoReferenceModel>(['grok-imagine-video-1.5'])

export function isGrokVideoReferenceModel(model: string): boolean {
  return GROK_VIDEO_REFERENCE_MODELS.has(model)
}

type GrokVideoSourceModel = {
  [TModel in GrokVideoModel]: 'mode' extends keyof GrokVideoModelProviderOptionsByName[TModel]
    ? TModel
    : never
}[GrokVideoModel]

const GROK_VIDEO_SOURCE_MODELS: ReadonlySet<string> =
  new Set<GrokVideoSourceModel>(['grok-imagine-video'])

export function isGrokVideoSourceModel(model: string): boolean {
  return GROK_VIDEO_SOURCE_MODELS.has(model)
}

export type GrokVideoModelProviderOptionsByName = {
  'grok-imagine-video': GrokVideoSourceProviderOptions
  'grok-imagine-video-1.5': GrokVideoProviderOptions
}

export type GrokVideoModelSizeByName = {
  'grok-imagine-video': GrokVideoSizeV1
  'grok-imagine-video-1.5': GrokVideoSize
}

export type GrokVideoModelInputModalitiesByName = {
  'grok-imagine-video': readonly ['image', 'video']
  'grok-imagine-video-1.5': readonly ['image']
}
