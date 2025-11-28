import type OpenAI from 'openai'
import { z } from 'zod'
import type { Tool } from '@tanstack/ai'

export type CustomTool = OpenAI.Responses.CustomTool

/**
 * Converts a standard Tool to OpenAI CustomTool format
 */
export function convertCustomToolToAdapterFormat(tool: Tool): CustomTool {
  const metadata = tool.metadata as CustomTool
  return {
    type: 'custom',
    name: metadata.name,
    description: metadata.description,
    format: metadata.format,
  }
}

/**
 * Creates a standard Tool from CustomTool parameters
 */
export function customTool(toolData: CustomTool): Tool {
  return {
    name: 'custom',
    description: toolData.description || 'A custom tool',
    inputSchema: z.object({}),
    metadata: {
      ...toolData,
    },
  }
}
