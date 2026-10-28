import { openAIProviderTool } from './openai-provider-tool'
import { getComputerUseToolMetadata } from '@tanstack/ai/adapter-internals'
import type { ComputerTool } from 'openai/resources/responses/responses'
import type { Tool } from '@tanstack/ai'

/**
 * The computer tool: `{ type: 'computer' }`.
 */
export type ComputerUseToolConfig = ComputerTool

/**
 * Converts a standard Tool to OpenAI ComputerUseTool format
 */
export function convertComputerUseToolToAdapterFormat(
  _tool: Tool,
): ComputerUseToolConfig {
  return { type: 'computer' }
}

/**
 * Creates a standard Tool from ComputerUseTool parameters. The tool name is
 * the tool type: `computer`.
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
 * Swaps a portable computer-use tool for the native OpenAI computer tool,
 * `{ type: 'computer' }`. The result keeps the name `computer` and the
 * `execute` of the portable tool. Other tools come back unchanged.
 *
 * @param tool - A tool from the chat tool list.
 */
export function resolveComputerUseTool(tool: Tool): Tool {
  if (!getComputerUseToolMetadata(tool)) return tool
  const native = computerUseTool({ type: 'computer' })
  return { ...native, name: 'computer', execute: tool.execute }
}
