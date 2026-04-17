import type OpenAI from 'openai'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type ComputerUseToolConfig = OpenAI.Responses.ComputerTool

/** @deprecated Renamed to `ComputerUseToolConfig`. Will be removed in a future release. */
export type ComputerUseTool = ComputerUseToolConfig

export type OpenAIComputerUseTool = ProviderTool<'openai', 'computer_use'>

/**
 * Converts a standard Tool to OpenAI ComputerUseTool format
 */
export function convertComputerUseToolToAdapterFormat(
  tool: Tool,
): ComputerUseToolConfig {
  const metadata = tool.metadata as ComputerUseToolConfig
  return {
    type: 'computer_use_preview',
    display_height: metadata.display_height,
    display_width: metadata.display_width,
    environment: metadata.environment,
  }
}

/**
 * Creates a standard Tool from ComputerUseTool parameters
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
