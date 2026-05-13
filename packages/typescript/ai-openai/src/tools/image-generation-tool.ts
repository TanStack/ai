import { imageGenerationTool as baseImageGenerationTool } from '@tanstack/openai-compatible'
import type { ProviderTool } from '@tanstack/ai'
import type { ImageGenerationToolConfig } from '@tanstack/openai-compatible'

export {
  type ImageGenerationToolConfig,
  type ImageGenerationTool,
  convertImageGenerationToolToAdapterFormat,
} from '@tanstack/openai-compatible'

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
  return baseImageGenerationTool(toolData) as OpenAIImageGenerationTool
}
