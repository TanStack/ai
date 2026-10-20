import {
  getOpenAIProviderToolMetadata,
  openAIProviderTool,
} from './openai-provider-tool'
import { getComputerUseToolMetadata } from '@tanstack/ai/adapter-internals'
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

/**
 * Swaps a portable computer-use tool for the native OpenAI computer tool of
 * the model. The `computer-use-preview` models get `computer_use_preview`
 * with the display and environment of the tool. Other models get
 * `{ type: 'computer' }`. The result keeps the name `computer` and the
 * `execute` of the portable tool. Other tools come back unchanged.
 *
 * @param tool - A tool from the chat tool list.
 * @param model - The model of the request.
 */
export function resolveComputerUseTool(tool: Tool, model: string): Tool {
  const metadata = getComputerUseToolMetadata(tool)
  if (!metadata) return tool
  // Dated ids such as `computer-use-preview-2025-03-11` match too.
  const isPreviewModel = model.startsWith('computer-use-preview')
  const native = computerUseTool(
    isPreviewModel
      ? {
          type: 'computer_use_preview',
          display_width: metadata.display.width,
          display_height: metadata.display.height,
          environment: metadata.environment,
        }
      : { type: 'computer' },
  )
  return { ...native, name: 'computer', execute: tool.execute }
}
