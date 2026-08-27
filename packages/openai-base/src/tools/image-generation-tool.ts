import {
  getOpenAIProviderToolMetadata,
  openAIProviderTool,
} from './openai-provider-tool'
import type { Tool as SDKTool } from 'openai/resources/responses/responses'
import type { Tool } from '@tanstack/ai'

type ImageGenerationToolConfig = SDKTool.ImageGeneration

export type { ImageGenerationToolConfig }

/** @deprecated Renamed to `ImageGenerationToolConfig`. Will be removed in a future release. */
export type ImageGenerationTool = ImageGenerationToolConfig

const validatePartialImages = (value: number | undefined) => {
  const isPartialImagesOutOfRange =
    value !== undefined && (value < 0 || value > 3)
  if (isPartialImagesOutOfRange) {
    throw new Error('partial_images must be between 0 and 3')
  }
}

export function convertImageGenerationToolToAdapterFormat(
  tool: Tool,
): ImageGenerationToolConfig {
  const metadata = getOpenAIProviderToolMetadata(tool) as Omit<
    ImageGenerationToolConfig,
    'type'
  >
  return {
    ...metadata,
    type: 'image_generation',
  }
}

export function imageGenerationTool(
  toolData: Omit<ImageGenerationToolConfig, 'type'>,
): Tool {
  validatePartialImages(toolData.partial_images)
  return openAIProviderTool(
    {
      name: 'image_generation',
      description: 'Generate images based on text descriptions',
      metadata: {
        ...toolData,
      },
    },
    'image_generation',
  )
}

export { validatePartialImages }
