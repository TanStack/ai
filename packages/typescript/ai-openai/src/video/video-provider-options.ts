/**
 * OpenAI Video Generation Provider Options
 *
 * Based on https://platform.openai.com/docs/api-reference/videos/create
 *
 * @experimental Video generation is an experimental feature and may change.
 */

/**
 * Supported video sizes for OpenAI Sora video generation.
 * Based on the official API documentation.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type OpenAIVideoSize =
  | '1280x720' // 720p landscape (16:9)
  | '720x1280' // 720p portrait (9:16)
  | '1792x1024' // Landscape wide
  | '1024x1792' // Portrait tall

/**
 * Supported video durations (in seconds) for OpenAI Sora video generation.
 * The API uses the `seconds` parameter with STRING values '4', '8', or '12'.
 * Yes, really. They're strings.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type OpenAIVideoSeconds = '4' | '8' | '12'

/**
 * Provider-specific options for OpenAI video generation.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface OpenAIVideoProviderOptions {
  /**
   * Video size in WIDTHxHEIGHT format.
   * Supported: '1280x720', '720x1280', '1792x1024', '1024x1792'
   */
  size?: OpenAIVideoSize

  /**
   * Video duration in seconds.
   * Supported values: 4, 8, or 12 seconds.
   */
  seconds?: OpenAIVideoSeconds
}

/**
 * Model-specific provider options mapping.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type OpenAIVideoModelProviderOptionsByName = {
  'sora-2': OpenAIVideoProviderOptions
  'sora-2-pro': OpenAIVideoProviderOptions
}

/**
 * Model-specific provider options mapping.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type OpenAIVideoModelSizeByName = {
  'sora-2': OpenAIVideoSize
  'sora-2-pro': OpenAIVideoSize
}

/**
 * Validate video size for a given model.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
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

/**
 * Validate video duration (seconds) for a given model.
 * Accepts both string and number for convenience, but the API requires strings.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
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

/**
 * Convert duration to API format (string).
 * The OpenAI Sora API inexplicably requires seconds as a string.
 */
export function toApiSeconds(
  seconds: number | string | undefined,
): OpenAIVideoSeconds | undefined {
  if (seconds === undefined) return undefined
  return String(seconds) as OpenAIVideoSeconds
}
