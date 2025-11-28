import type {
  BetaToolComputerUse20241022,
  BetaToolComputerUse20250124,
} from '@anthropic-ai/sdk/resources/beta'
import { z } from 'zod'
import type { Tool } from '@tanstack/ai'

export type ComputerUseTool =
  | BetaToolComputerUse20241022
  | BetaToolComputerUse20250124

export function convertComputerUseToolToAdapterFormat(
  tool: Tool,
): ComputerUseTool {
  const metadata = tool.metadata as ComputerUseTool
  return metadata
}

export function computerUseTool(config: ComputerUseTool): Tool {
  return {
    name: 'computer',
    description: '',
    inputSchema: z.object({}),
    metadata: config,
  }
}
