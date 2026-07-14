import {
  brandAnthropicProviderTool,
  getAnthropicProviderToolMetadata,
} from './anthropic-provider-tool'
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
  const metadata = getAnthropicProviderToolMetadata(
    tool,
  ) as ComputerUseToolConfig
  return metadata
}

export function computerUseTool(
  config: ComputerUseToolConfig,
): AnthropicComputerUseTool {
  return brandAnthropicProviderTool<AnthropicComputerUseTool>(
    {
      name: 'computer',
      description: '',
      metadata: config,
    },
    'computer_use',
  )
}
