import {
  getOpenAIProviderToolMetadata,
  openAIProviderTool,
} from './openai-provider-tool'
import type { ComputerUsePreviewTool as ComputerUseToolConfig } from 'openai/resources/responses/responses'
import type { Tool } from '@tanstack/ai'

export type { ComputerUseToolConfig }

/** @deprecated Renamed to `ComputerUseToolConfig`. Will be removed in a future release. */
export type ComputerUseTool = ComputerUseToolConfig

export function convertComputerUseToolToAdapterFormat(
  tool: Tool,
): ComputerUseToolConfig {
  const metadata = getOpenAIProviderToolMetadata(tool) as ComputerUseToolConfig
  return {
    type: 'computer_use_preview',
    display_height: metadata.display_height,
    display_width: metadata.display_width,
    environment: metadata.environment,
  }
}

export function computerUseTool(toolData: ComputerUseToolConfig): Tool {
  return openAIProviderTool(
    {
      name: 'computer_use_preview',
      description: 'Control a virtual computer',
      metadata: {
        ...toolData,
      },
    },
    'computer_use',
  )
}
