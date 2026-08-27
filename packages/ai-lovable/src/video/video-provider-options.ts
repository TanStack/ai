export type LovableHdVideoSize =
  | '1280x720'
  | '720x1280'
  | '1920x1080'
  | '1080x1920'

export type Lovable4kVideoSize = '3840x2160' | '2160x3840'

export type LovableVideoSize = LovableHdVideoSize | Lovable4kVideoSize

export type LovableVideoSeconds = '4' | '6' | '8'

export type LovableVideoDuration = 4 | 6 | 8

export interface LovableVideoProviderOptions {
  size?: LovableVideoSize
  seconds?: LovableVideoSeconds
}

const HD_SIZES: ReadonlyArray<LovableHdVideoSize> = [
  '1280x720',
  '720x1280',
  '1920x1080',
  '1080x1920',
]

const FOUR_K_SIZES: ReadonlyArray<Lovable4kVideoSize> = [
  '3840x2160',
  '2160x3840',
]

const ALL_SIZES: ReadonlyArray<LovableVideoSize> = [
  ...HD_SIZES,
  ...FOUR_K_SIZES,
]

const HIGH_RES_SIZES: ReadonlySet<string> = new Set([
  '1920x1080',
  '1080x1920',
  '3840x2160',
  '2160x3840',
])

const FOUR_K_MODELS: ReadonlySet<string> = new Set([
  'google/veo-3.1-fast',
  'google/veo-3.1',
])

export function is4kVideoSize(size: string): size is Lovable4kVideoSize {
  return (FOUR_K_SIZES as ReadonlyArray<string>).includes(size)
}

export function isHighResVideoSize(size: string): boolean {
  return HIGH_RES_SIZES.has(size)
}

export function supports4kVideo(model: string): boolean {
  return FOUR_K_MODELS.has(model)
}

export function validateVideoSize(
  model: string,
  size?: string,
): asserts size is LovableVideoSize | undefined {
  if (!size) return

  if (!(ALL_SIZES as ReadonlyArray<string>).includes(size)) {
    throw new Error(
      `Size "${size}" is not supported by model "${model}". Supported sizes: ${ALL_SIZES.join(', ')}`,
    )
  }

  if (is4kVideoSize(size) && !supports4kVideo(model)) {
    throw new Error(
      `Size "${size}" is 4K. Only google/veo-3.1-fast and google/veo-3.1 support 4K.`,
    )
  }
}

export function validateVideoSeconds(
  model: string,
  seconds?: number | string,
): asserts seconds is LovableVideoSeconds | LovableVideoDuration | undefined {
  if (seconds === undefined) return

  const isValid =
    typeof seconds === 'string'
      ? seconds === '4' || seconds === '6' || seconds === '8'
      : seconds === 4 || seconds === 6 || seconds === 8

  if (!isValid) {
    throw new Error(
      `Duration "${seconds}" is not supported by model "${model}". Supported durations: 4, 6, or 8 seconds`,
    )
  }
}

export function validateHighResDuration(
  model: string,
  size: string | undefined,
  seconds: number | string | undefined,
): void {
  if (!size) return
  if (!isHighResVideoSize(size)) return

  const asNumber =
    seconds === undefined
      ? undefined
      : typeof seconds === 'string'
        ? Number(seconds)
        : seconds

  const invalidHighResDuration = asNumber !== undefined && asNumber !== 8
  if (invalidHighResDuration) {
    throw new Error(
      `Model "${model}" requires 8 second clips at 1080p and 4K. Received duration ${seconds}.`,
    )
  }
}

export function toApiSeconds(
  seconds: number | string | undefined,
): LovableVideoSeconds | undefined {
  if (seconds === undefined) return undefined
  return String(seconds) as LovableVideoSeconds
}
