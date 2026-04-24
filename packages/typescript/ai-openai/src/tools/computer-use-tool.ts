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
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'computer_use_preview',
    description: 'Control a virtual computer',
    metadata: {
      ...toolData,
    },
  } as unknown as OpenAIComputerUseTool
}
