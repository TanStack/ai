import type { ProviderTool } from '@tanstack/ai'
import type { ImageGenerationToolConfig } from '@tanstack/openai-base'

export {
  type ImageGenerationToolConfig,
  type ImageGenerationTool,
  convertImageGenerationToolToAdapterFormat,
} from '@tanstack/openai-base'

export type OpenAIImageGenerationTool = ProviderTool<
  'openai',
  'image_generation'
>

const validatePartialImages = (value: number | undefined) => {
  if (value !== undefined && (value < 0 || value > 3)) {
    throw new Error('partial_images must be between 0 and 3')
  }
}

/**
 * Creates a standard Tool from ImageGenerationTool parameters, branded as an
 * OpenAI provider tool.
 */
export function imageGenerationTool(
  toolData: Omit<ImageGenerationToolConfig, 'type'>,
): OpenAIImageGenerationTool {
  validatePartialImages(toolData.partial_images)
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'image_generation',
    description: 'Generate images based on text descriptions',
    metadata: {
      ...toolData,
    },
  } as unknown as OpenAIImageGenerationTool
}
