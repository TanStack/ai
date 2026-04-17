import { convertFunctionToolToAdapterFormat } from './function-tool'
import { convertWebSearchToolToAdapterFormat } from './web-search-tool'
import type { Tool } from '@tanstack/ai'
import type { FunctionTool } from './function-tool'
import type { WebSearchToolConfig } from './web-search-tool'

export type OpenRouterTool = FunctionTool | WebSearchToolConfig

export function convertToolsToProviderFormat(
  tools: Array<Tool>,
): Array<OpenRouterTool> {
  return tools.map((tool) => {
    if (tool.name === 'web_search') {
      return convertWebSearchToolToAdapterFormat(tool)
    }
    return convertFunctionToolToAdapterFormat(tool)
  })
}
