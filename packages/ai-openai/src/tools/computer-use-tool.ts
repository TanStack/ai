import { computerUseTool as baseComputerUseTool } from '@tanstack/openai-base'
import type { ProviderTool } from '@tanstack/ai'
import type { ComputerUseToolConfig } from '@tanstack/openai-base'

export {
  type ComputerUseToolConfig,
  convertComputerUseToolToAdapterFormat,
} from '@tanstack/openai-base'

// The brand discriminator (`computer_use`) intentionally differs from the
// runtime tool name (`computer` or `computer_use_preview`). The brand matches
// the model-meta tool-capability union (`tools: ['computer_use', ...]`) used to
// gate which models can construct this tool at compile time, while the runtime
// name matches the tool type in the OpenAI SDK. The base factory records the
// canonical `computer_use` kind separately in adapter metadata.
export type OpenAIComputerUseTool = ProviderTool<'openai', 'computer_use'>

/**
 * Creates a standard Tool from ComputerUseToolConfig parameters, branded as an
 * OpenAI provider tool.
 */
export function computerUseTool(
  toolData: ComputerUseToolConfig,
): OpenAIComputerUseTool {
  return baseComputerUseTool(toolData) as OpenAIComputerUseTool
}
