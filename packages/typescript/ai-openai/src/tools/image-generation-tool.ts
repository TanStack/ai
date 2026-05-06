import { validatePartialImages } from '@tanstack/openai-base'
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
