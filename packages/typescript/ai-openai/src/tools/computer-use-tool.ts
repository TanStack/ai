import { computerUseTool as baseComputerUseTool } from '@tanstack/openai-compatible'
import type { ProviderTool } from '@tanstack/ai'
import type { ComputerUseToolConfig } from '@tanstack/openai-compatible'

export {
  type ComputerUseToolConfig,
  type ComputerUseTool,
  convertComputerUseToolToAdapterFormat,
} from '@tanstack/openai-compatible'

// The brand discriminator (`computer_use`) intentionally differs from the
// runtime tool name (`computer_use_preview`). The brand matches the model-meta
// tool-capability union (`tools: ['computer_use', ...]`) used to gate which
// models can construct this tool at compile time, while the runtime name
// matches the OpenAI SDK's literal `'computer_use_preview'` that the
// special-tool dispatcher in `convertToolsToProviderFormat` switches on.
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
