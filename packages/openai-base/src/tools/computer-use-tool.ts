import {
  getOpenAIProviderToolMetadata,
  openAIProviderTool,
} from './openai-provider-tool'
import type {
  ComputerTool,
  ComputerUsePreviewTool,
} from 'openai/resources/responses/responses'
import type { Tool } from '@tanstack/ai'

/**
 * The computer tool: `{ type: 'computer' }`, or the `computer_use_preview`
 * tool of the `computer-use-preview` model.
 */
export type ComputerUseToolConfig = ComputerTool | ComputerUsePreviewTool

/** @deprecated Renamed to `ComputerUseToolConfig`. Will be removed in a future release. */
export type ComputerUseTool = ComputerUseToolConfig

/**
 * Converts a standard Tool to OpenAI ComputerUseTool format
 */
export function convertComputerUseToolToAdapterFormat(
  tool: Tool,
): ComputerUseToolConfig {
  const metadata = getOpenAIProviderToolMetadata(tool) as ComputerUseToolConfig
  if (metadata.type === 'computer') return { type: 'computer' }
  return {
    type: 'computer_use_preview',
    display_height: metadata.display_height,
    display_width: metadata.display_width,
    environment: metadata.environment,
  }
}

/**
 * Creates a standard Tool from ComputerUseTool parameters. The tool name is
 * the tool type: `computer` or `computer_use_preview`.
 *
 * Base (non-branded) factory. Providers that need branded return types should
 * re-wrap this in their own package.
 */
export function computerUseTool(toolData: ComputerUseToolConfig): Tool {
  return openAIProviderTool(
    {
      name: toolData.type,
      description: 'Control a virtual computer',
      metadata: {
        ...toolData,
      },
    },
    'computer_use',
  )
}
