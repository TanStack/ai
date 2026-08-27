export type OpenAIVideoSize =
  | '1280x720'
  | '720x1280'
  | '1792x1024'
  | '1024x1792'

export type OpenAIVideoSeconds = '4' | '8' | '12'

export interface OpenAIVideoProviderOptions {
  size?: OpenAIVideoSize

  seconds?: OpenAIVideoSeconds
}

export type OpenAIVideoModelProviderOptionsByName = {
  'sora-2': OpenAIVideoProviderOptions
  'sora-2-pro': OpenAIVideoProviderOptions
}

export type OpenAIVideoModelSizeByName = {
  'sora-2': OpenAIVideoSize
  'sora-2-pro': OpenAIVideoSize
}

export type OpenAIVideoModelInputModalitiesByName = {
  'sora-2': readonly ['image']
  'sora-2-pro': readonly ['image']
}

export function validateVideoSize(
  model: string,
  size?: string,
): asserts size is OpenAIVideoSize | undefined {
  const validSizes: Array<OpenAIVideoSize> = [
    '1280x720',
    '720x1280',
    '1792x1024',
    '1024x1792',
  ]

  if (size && !validSizes.includes(size as OpenAIVideoSize)) {
    throw new Error(
      `Size "${size}" is not supported by model "${model}". Supported sizes: ${validSizes.join(', ')}`,
    )
  }
}

export function validateVideoSeconds(
  model: string,
  seconds?: number | string,
): asserts seconds is OpenAIVideoSeconds | number | undefined {
  const validSeconds: Array<string> = ['4', '8', '12']
  const validNumbers: Array<number> = [4, 8, 12]

  if (seconds !== undefined) {
    const isValid =
      typeof seconds === 'string'
        ? validSeconds.includes(seconds)
        : validNumbers.includes(seconds)

    if (!isValid) {
      throw new Error(
        `Duration "${seconds}" is not supported by model "${model}". Supported durations: 4, 8, or 12 seconds`,
      )
    }
  }
}

export function toApiSeconds(
  seconds: number | string | undefined,
): OpenAIVideoSeconds | undefined {
  if (seconds === undefined) return undefined
  return String(seconds) as OpenAIVideoSeconds
}
