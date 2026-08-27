import { isKnownBytePlusVideoModel } from '../model-meta'
import type {
  BytePlusVideoModel,
  BytePlusVideoModelOrString,
  BytePlusVideoRatio,
  BytePlusVideoResolution,
} from '../model-meta'

export type BytePlusVideoServiceTier = 'default' | 'flex'

export type BytePlusVideoOutputFormat = 'mp4' | 'mov'

export interface BytePlusVideoProviderOptions {
  ratio?: BytePlusVideoRatio

  resolution?: BytePlusVideoResolution

  duration?: number

  frames?: number

  seed?: number

  camera_fixed?: boolean

  /** Burn a watermark into the output. Defaults to `false`. */
  watermark?: boolean

  generate_audio?: boolean

  service_tier?: BytePlusVideoServiceTier

  return_last_frame?: boolean

  draft?: boolean

  priority?: number

  output_format?: BytePlusVideoOutputFormat

  execution_expires_after?: number

  callback_url?: string

  safety_identifier?: string
}

export type BytePlusVideoModelProviderOptionsByName = {
  [K in BytePlusVideoModel]: BytePlusVideoProviderOptions
}

const BYTEPLUS_VIDEO_RATIOS: ReadonlyArray<string> = [
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '1:1',
  '21:9',
  'adaptive',
]

const BYTEPLUS_VIDEO_RESOLUTIONS: {
  readonly [K in BytePlusVideoModel]: ReadonlyArray<BytePlusVideoResolution>
} = {
  'dreamina-seedance-2-5-260628': ['480p', '720p', '1080p'],
  'dreamina-seedance-2-0-260128': ['480p', '720p', '1080p', '4k'],
  'dreamina-seedance-2-0-fast-260128': ['480p', '720p'],
  'dreamina-seedance-2-0-mini-260615': ['480p', '720p'],
  'seedance-1-5-pro-251215': ['480p', '720p', '1080p'],
  'seedance-1-0-pro-250528': ['480p', '720p', '1080p'],
  'seedance-1-0-pro-fast-251015': ['480p', '720p', '1080p'],
}

const BYTEPLUS_VIDEO_REFERENCE_MEDIA_MODELS: ReadonlySet<string> = new Set([
  'dreamina-seedance-2-5-260628',
  'dreamina-seedance-2-0-260128',
  'dreamina-seedance-2-0-fast-260128',
  'dreamina-seedance-2-0-mini-260615',
])

const BYTEPLUS_VIDEO_LAST_FRAME_MODELS: ReadonlySet<string> = new Set([
  'dreamina-seedance-2-5-260628',
  'dreamina-seedance-2-0-260128',
  'dreamina-seedance-2-0-fast-260128',
  'dreamina-seedance-2-0-mini-260615',
  'seedance-1-5-pro-251215',
  'seedance-1-0-pro-250528',
])

const BYTEPLUS_VIDEO_AUDIO_ONLY_REFERENCE_MODELS: ReadonlySet<string> = new Set(
  ['dreamina-seedance-2-5-260628'],
)

export function supportsReferenceMedia(model: string): boolean {
  return BYTEPLUS_VIDEO_REFERENCE_MEDIA_MODELS.has(model)
}

export function supportsLastFrame(model: string): boolean {
  return BYTEPLUS_VIDEO_LAST_FRAME_MODELS.has(model)
}

export function supportsAudioOnlyReference(model: string): boolean {
  return BYTEPLUS_VIDEO_AUDIO_ONLY_REFERENCE_MODELS.has(model)
}

export function parseBytePlusVideoSize(
  size: string,
): { ratio: string; resolution?: string } | undefined {
  const match = /^(\d+:\d+|adaptive)(?:_(.+))?$/.exec(size)
  const [, ratio, resolution] = match ?? []
  if (ratio === undefined) return undefined
  return {
    ratio,
    ...(resolution !== undefined && { resolution: resolution.toLowerCase() }),
  }
}

export function resolveBytePlusVideoResolution(
  model: BytePlusVideoModelOrString,
  resolution: string,
): string {
  const normalized = resolution.toLowerCase()
  if (!isKnownBytePlusVideoModel(model)) return normalized

  const allowed = BYTEPLUS_VIDEO_RESOLUTIONS[model]
  if (!allowed.includes(normalized as BytePlusVideoResolution)) {
    throw new Error(
      `byteplus: resolution "${resolution}" is not supported by model ` +
        `"${model}". Supported resolutions: ${allowed.join(', ')}.`,
    )
  }
  return normalized
}

export function resolveBytePlusVideoSize(
  model: BytePlusVideoModelOrString,
  size: string,
): { ratio: string; resolution?: string } {
  const parsed = parseBytePlusVideoSize(size)
  const known = isKnownBytePlusVideoModel(model)
  if (!parsed) {
    throw new Error(
      `byteplus: size "${size}" is not supported by model "${model}". Expected ` +
        `"ratio" or "ratio_resolution" (e.g. "16:9_720p") with ratio one of: ` +
        `${BYTEPLUS_VIDEO_RATIOS.join(', ')}.`,
    )
  }
  const unknownRatio = known && !BYTEPLUS_VIDEO_RATIOS.includes(parsed.ratio)
  if (unknownRatio) {
    throw new Error(
      `byteplus: size "${size}" is not supported by model "${model}". Expected ` +
        `"ratio" or "ratio_resolution" (e.g. "16:9_720p") with ratio one of: ` +
        `${BYTEPLUS_VIDEO_RATIOS.join(', ')}.`,
    )
  }

  return {
    ratio: parsed.ratio,
    ...(parsed.resolution !== undefined && {
      resolution: resolveBytePlusVideoResolution(model, parsed.resolution),
    }),
  }
}
