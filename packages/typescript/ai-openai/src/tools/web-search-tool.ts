
import type OpenAI from 'openai'
import type { Tool } from '@tanstack/ai'

export type WebSearchTool = OpenAI.Responses.WebSearchTool

/**
 * Converts a standard Tool to OpenAI WebSearchTool format
 */
export function convertWebSearchToolToAdapterFormat(tool: Tool): WebSearchTool {
  const metadata = tool.metadata as WebSearchTool
  return metadata
}

/**
 * Creates a standard Tool from WebSearchTool parameters
 */
export function webSearchTool(toolData: WebSearchTool): Tool {
  return {
    name: 'web_search',
    description: 'Search the web',
    metadata: toolData,
  }
}
