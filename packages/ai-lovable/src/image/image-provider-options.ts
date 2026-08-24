export type LovableImageSize = '1024x1024' | '1536x1024' | '1024x1536' | 'auto'

export type LovableImageQuality = 'high' | 'medium' | 'low' | 'auto'

export type LovableImageOutputFormat = 'png' | 'jpeg' | 'webp'

export type LovableImageBackground = 'transparent' | 'opaque' | 'auto'

export type LovableImageModeration = 'low' | 'auto'

export interface LovableImageProviderOptions {
  quality?: LovableImageQuality
  output_format?: LovableImageOutputFormat
  background?: LovableImageBackground
  moderation?: LovableImageModeration
  user?: string
}
