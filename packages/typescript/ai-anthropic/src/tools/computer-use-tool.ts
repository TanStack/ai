import type {
  BetaToolComputerUse20241022,
  BetaToolComputerUse20250124,
} from '@anthropic-ai/sdk/resources/beta'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type ComputerUseToolConfig =
  | BetaToolComputerUse20241022
  | BetaToolComputerUse20250124

/** @deprecated Renamed to `ComputerUseToolConfig`. Will be removed in a future release. */
export type ComputerUseTool = ComputerUseToolConfig

export type AnthropicComputerUseTool = ProviderTool<'anthropic', 'computer_use'>

export function convertComputerUseToolToAdapterFormat(
  tool: Tool,
): ComputerUseToolConfig {
  const metadata = tool.metadata as ComputerUseToolConfig
  return metadata
}

export function computerUseTool(
  config: ComputerUseToolConfig,
): AnthropicComputerUseTool {
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'computer',
    description: '',
    metadata: config,
  } as unknown as AnthropicComputerUseTool
}
