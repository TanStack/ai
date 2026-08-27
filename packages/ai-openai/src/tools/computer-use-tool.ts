import { computerUseTool as baseComputerUseTool } from '@tanstack/openai-base'
import type { ProviderTool } from '@tanstack/ai'
import type { ComputerUseToolConfig } from '@tanstack/openai-base'

export {
  type ComputerUseToolConfig,
  type ComputerUseTool,
  convertComputerUseToolToAdapterFormat,
} from '@tanstack/openai-base'

export type OpenAIComputerUseTool = ProviderTool<'openai', 'computer_use'>

/**
 * Creates a standard Tool from ComputerUseTool parameters, branded as an
 * OpenAI provider tool.
 */
export function computerUseTool(
  toolData: ComputerUseToolConfig,
): OpenAIComputerUseTool {
  return baseComputerUseTool(toolData) as OpenAIComputerUseTool
}
