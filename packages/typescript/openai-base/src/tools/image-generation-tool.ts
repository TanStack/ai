import type OpenAI from 'openai'
import type { Tool } from '@tanstack/ai'

export type ImageGenerationToolConfig = OpenAI.Responses.Tool.ImageGeneration

/** @deprecated Renamed to `ImageGenerationToolConfig`. Will be removed in a future release. */
export type ImageGenerationTool = ImageGenerationToolConfig

const validatePartialImages = (value: number | undefined) => {
  if (value !== undefined && (value < 0 || value > 3)) {
    throw new Error('partial_images must be between 0 and 3')
  }
}

/**
 * Converts a standard Tool to OpenAI ImageGenerationTool format
 */
export function convertImageGenerationToolToAdapterFormat(
  tool: Tool,
): ImageGenerationToolConfig {
  const metadata = tool.metadata as Omit<ImageGenerationToolConfig, 'type'>
  return {
    type: 'image_generation',
    ...metadata,
  }
}

/**
 * Creates a standard Tool from ImageGenerationTool parameters.
 *
 * Base (non-branded) factory. Providers that need branded return types should
 * re-wrap this in their own package.
 */
export function imageGenerationTool(
  toolData: Omit<ImageGenerationToolConfig, 'type'>,
): Tool {
  validatePartialImages(toolData.partial_images)
  return {
    name: 'image_generation',
    description: 'Generate images based on text descriptions',
    metadata: {
      ...toolData,
    },
  }
}

export { validatePartialImages }
