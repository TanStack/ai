import {
  brandGeminiProviderTool,
  getGeminiProviderToolMetadata,
} from './gemini-provider-tool'
import type { ComputerUse } from '@google/genai'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type ComputerUseToolConfig = ComputerUse

/** @deprecated Renamed to `ComputerUseToolConfig`. Will be removed in a future release. */
export type ComputerUseTool = ComputerUseToolConfig

export type GeminiComputerUseTool = ProviderTool<'gemini', 'computer_use'>

export function convertComputerUseToolToAdapterFormat(tool: Tool) {
  const metadata = getGeminiProviderToolMetadata(tool) as ComputerUseToolConfig
  return {
    computerUse: {
      ...(metadata.environment !== undefined && {
        environment: metadata.environment,
      }),
      ...(metadata.excludedPredefinedFunctions !== undefined && {
        excludedPredefinedFunctions: metadata.excludedPredefinedFunctions,
      }),
    },
  }
}

export function computerUseTool(
  config: ComputerUseToolConfig,
): GeminiComputerUseTool {
  return brandGeminiProviderTool<GeminiComputerUseTool>(
    {
      name: 'computer_use',
      description: '',
      metadata: {
        ...(config.environment !== undefined && {
          environment: config.environment,
        }),
        ...(config.excludedPredefinedFunctions !== undefined && {
          excludedPredefinedFunctions: config.excludedPredefinedFunctions,
        }),
      },
    },
    'computer_use',
  )
}
