import { z } from 'zod'
import type OpenAI from 'openai'
import type { Tool } from '@tanstack/ai'

export type ComputerUseTool = OpenAI.Responses.ComputerTool
/**
 * Converts a standard Tool to OpenAI ComputerUseTool format
 */
export function convertComputerUseToolToAdapterFormat(
  tool: Tool,
): ComputerUseTool {
  const metadata = tool.metadata as ComputerUseTool
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
export function computerUseTool(toolData: ComputerUseTool): Tool {
  return {
    name: 'computer_use_preview',
    description: 'Control a virtual computer',
    inputSchema: z.object({}),
    metadata: {
      ...toolData,
    },
  }
}
