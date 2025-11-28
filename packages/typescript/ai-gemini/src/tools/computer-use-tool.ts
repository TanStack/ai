
import type { ComputerUse } from '@google/genai'
import type { Tool } from '@tanstack/ai'

export type ComputerUseTool = ComputerUse

export function convertComputerUseToolToAdapterFormat(tool: Tool) {
  const metadata = tool.metadata as ComputerUseTool
  return {
    computerUse: {
      environment: metadata.environment,
      excludedPredefinedFunctions: metadata.excludedPredefinedFunctions,
    },
  }
}

export function computerUseTool(config: ComputerUseTool): Tool {
  return {
    name: 'computer_use',
    description: '',
    metadata: {
      environment: config.environment,
      excludedPredefinedFunctions: config.excludedPredefinedFunctions,
    },
  }
}
