import type { Tool as SDKTool } from 'openai/resources/responses/responses'
import type { Tool } from '@tanstack/ai'

type ImageGenerationToolConfig = SDKTool.ImageGeneration

export type { ImageGenerationToolConfig }

/** @deprecated Renamed to `ImageGenerationToolConfig`. Will be removed in a future release. */
export type ImageGenerationTool = ImageGenerationToolConfig

const validatePartialImages = (value: number | undefined) => {
  if (value !== undefined && (value < 0 || value > 3)) {
    throw new Error('partial_images must be between 0 and 3')
  }
}

/**
 * Converts a standard Tool to OpenAI ImageGenerationTool format. Spread
 * `metadata` first, then force `type: 'image_generation'` last so a stray
 * `metadata.type` cannot shadow the wire discriminator.
 */
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
import {
  getOpenAIProviderToolMetadata,
  openAIProviderTool,
} from './openai-provider-tool'
