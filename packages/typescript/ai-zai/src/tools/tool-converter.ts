import { convertFunctionToolToAdapterFormat } from './function-tool'
import { convertWebSearchToolToAdapterFormat } from './web-search-tool'
import type { Tool } from '@tanstack/ai'
import type OpenAI from 'openai'
import type { ZaiWebSearchTool } from './web-search-tool'

/**
 * Union type representing any valid Z.AI tool.
 * Can be a standard function tool or a web search tool.
 */
export type ZaiTool = OpenAI.Chat.Completions.ChatCompletionTool | ZaiWebSearchTool

/**
 * Converts an array of standard Tools to Zhipu AI specific format
 */
export function convertToolsToProviderFormat(
  tools: Array<Tool>,
): Array<ZaiTool> {
  return tools.map((tool) => {
    // Handle special tool names
    if (tool.name === 'web_search') {
      return convertWebSearchToolToAdapterFormat(tool)
    }

    // Default to function tool
    return convertFunctionToolToAdapterFormat(tool)
  })
}
