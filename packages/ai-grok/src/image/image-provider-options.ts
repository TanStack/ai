export type GrokImageSize = '1024x1024' | '1536x1024' | '1024x1536'

export type GrokImagineAspectRatio =
  | '1:1'
  | '3:4'
  | '4:3'
  | '9:16'
  | '16:9'
  | '2:3'
  | '3:2'
  | '9:19.5'
  | '19.5:9'
  | '9:20'
  | '20:9'
  | '1:2'
  | '2:1'
  | 'auto'

export type GrokImagineResolution = '1k' | '2k'

export type GrokImagineImageSize =
  | GrokImagineAspectRatio
  | `${GrokImagineAspectRatio}_${GrokImagineResolution}`

const GROK_IMAGINE_ASPECT_RATIOS: ReadonlyArray<string> = [
  '1:1',
  '3:4',
  '4:3',
  '9:16',
  '16:9',
  '2:3',
  '3:2',
  '9:19.5',
  '19.5:9',
  '9:20',
  '20:9',
  '1:2',
  '2:1',
  'auto',
]

const GROK_IMAGINE_RESOLUTIONS: ReadonlyArray<string> = ['1k', '2k']

export function isGrokImagineImageModel(model: string): boolean {
  return model.startsWith('grok-imagine-image')
}

export function parseGrokImagineSize(
  size: string,
): { aspectRatio: string; resolution?: string } | undefined {
  const match = size.match(/^([\d.]+:[\d.]+|auto)(?:_(.+))?$/)
  const [, aspectRatio, resolution] = match ?? []
  if (aspectRatio === undefined) return undefined
  return { aspectRatio, ...(resolution !== undefined && { resolution }) }
}

export interface GrokImageBaseProviderOptions {
  user?: string
}

export interface GrokImageProviderOptions extends GrokImageBaseProviderOptions {
  quality?: 'standard' | 'hd'

  response_format?: 'url' | 'b64_json'
}

export interface GrokImagineImageProviderOptions extends GrokImageBaseProviderOptions {
  response_format?: 'url' | 'b64_json'

  resolution?: '1k' | '2k'

  service_tier?: 'default' | 'priority'
}

export interface GrokImagineImage2ProviderOptions extends GrokImagineImageProviderOptions {
  quality?: 'low' | 'medium'
}

export type GrokImageModelProviderOptionsByName = {
  'grok-2-image-1212': GrokImageProviderOptions
  'grok-imagine-image': GrokImagineImageProviderOptions
  'grok-imagine-image-2.0': GrokImagineImage2ProviderOptions
  'grok-imagine-image-quality': GrokImagineImageProviderOptions
}

export type GrokImageModelSizeByName = {
  'grok-2-image-1212': GrokImageSize
  'grok-imagine-image': GrokImagineImageSize
  'grok-imagine-image-2.0': GrokImagineImageSize
  'grok-imagine-image-quality': GrokImagineImageSize
}

export type GrokImageModelInputModalitiesByName = {
  'grok-2-image-1212': readonly []
  'grok-imagine-image': readonly ['image']
  'grok-imagine-image-2.0': readonly ['image']
  'grok-imagine-image-quality': readonly ['image']
}

interface ImageValidationOptions {
  prompt: string
  model: string
}

export function validateImageSize(
  model: string,
  size: string | undefined,
): void {
  if (!size) return

  if (isGrokImagineImageModel(model)) {
    const parsed = parseGrokImagineSize(size)
    const isUnsupportedImagineSize =
      !parsed ||
      !GROK_IMAGINE_ASPECT_RATIOS.includes(parsed.aspectRatio) ||
      (parsed.resolution !== undefined &&
        !GROK_IMAGINE_RESOLUTIONS.includes(parsed.resolution))
    if (isUnsupportedImagineSize) {
      throw new Error(
        `Size "${size}" is not supported by model "${model}". ` +
          `Expected an aspect ratio (${GROK_IMAGINE_ASPECT_RATIOS.join(', ')}) ` +
          `optionally suffixed with a resolution ("16:9_2k"; resolutions: ${GROK_IMAGINE_RESOLUTIONS.join(', ')}).`,
      )
    }
    return
  }

  const validSizes: Record<string, Array<string>> = {
    'grok-2-image-1212': ['1024x1024', '1536x1024', '1024x1536'],
  }

  const modelSizes = validSizes[model]
  if (!modelSizes) {
    throw new Error(`Unknown image model: ${model}`)
  }

  if (!modelSizes.includes(size)) {
    throw new Error(
      `Size "${size}" is not supported by model "${model}". ` +
        `Supported sizes: ${modelSizes.join(', ')}`,
    )
  }
}

export function validateNumberOfImages(
  _model: string,
  numberOfImages: number | undefined,
): void {
  if (numberOfImages === undefined) return

  // grok-2-image-1212 supports 1-10 images per request
  const isOutOfRange = numberOfImages < 1 || numberOfImages > 10
  if (isOutOfRange) {
    throw new Error(
      `Number of images must be between 1 and 10. Requested: ${numberOfImages}`,
    )
  }
}

export const validatePrompt = (options: ImageValidationOptions) => {
  if (options.prompt.length === 0) {
    throw new Error('Prompt cannot be empty.')
  }
  // Grok image model supports up to 4000 characters
  if (options.prompt.length > 4000) {
    throw new Error(
      'For grok-2-image-1212, prompt length must be less than or equal to 4000 characters.',
    )
  }
}
