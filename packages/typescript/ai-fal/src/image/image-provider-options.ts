/**
 * fal.ai image size presets supported by most models.
 * These are semantic names that fal.ai accepts directly.
 */
export type FalImageSizePreset =
  | 'square_hd'
  | 'square'
  | 'landscape_4_3'
  | 'landscape_16_9'
  | 'portrait_4_3'
  | 'portrait_16_9'

/**
 * Mapping of standard TanStack AI sizes to fal.ai size presets.
 */
const SIZE_TO_FAL_PRESET: Record<string, FalImageSizePreset> = {
  '1024x1024': 'square_hd',
  '512x512': 'square',
  '1024x768': 'landscape_4_3',
  '768x1024': 'portrait_4_3',
  '1280x720': 'landscape_16_9',
  '720x1280': 'portrait_16_9',
  '1920x1080': 'landscape_16_9',
  '1080x1920': 'portrait_16_9',
}

/**
 * Maps TanStack AI size format (WIDTHxHEIGHT) to fal.ai format.
 * fal.ai accepts either preset names or { width, height } objects.
 */
export function mapSizeToFalFormat(
  size: string | undefined,
): FalImageSizePreset | { width: number; height: number } | undefined {
  if (!size) return undefined

  // Check if it's a known preset mapping
  const preset = SIZE_TO_FAL_PRESET[size]
  if (preset) return preset

  // Try to parse as WIDTHxHEIGHT
  const match = size.match(/^(\d+)x(\d+)$/)
  if (match && match[1] && match[2]) {
    return {
      width: parseInt(match[1], 10),
      height: parseInt(match[2], 10),
    }
  }

  // If it's already a preset name, return as-is
  if (Object.values(SIZE_TO_FAL_PRESET).includes(size as FalImageSizePreset)) {
    return size as FalImageSizePreset
  }

  return undefined
}
