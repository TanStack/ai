import type { ComputerUse } from '@google/genai'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type ComputerUseToolConfig = ComputerUse

/** @deprecated Renamed to `ComputerUseToolConfig`. Will be removed in a future release. */
export type ComputerUseTool = ComputerUseToolConfig

export type GeminiComputerUseTool = ProviderTool<'gemini', 'computer_use'>

export function convertComputerUseToolToAdapterFormat(tool: Tool) {
  const metadata = tool.metadata as ComputerUseToolConfig
  return {
    computerUse: {
      environment: metadata.environment,
      excludedPredefinedFunctions: metadata.excludedPredefinedFunctions,
    },
  }
}

export function computerUseTool(
  config: ComputerUseToolConfig,
): GeminiComputerUseTool {
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'computer_use',
    description: '',
    metadata: {
      environment: config.environment,
      excludedPredefinedFunctions: config.excludedPredefinedFunctions,
    },
  } as unknown as GeminiComputerUseTool
}
