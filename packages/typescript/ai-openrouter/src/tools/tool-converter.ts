import { convertFunctionToolToAdapterFormat } from './function-tool'
import {
  convertWebSearchToolToAdapterFormat,
  isWebSearchTool,
} from './web-search-tool'
import type { Tool } from '@tanstack/ai'
import type { FunctionTool } from './function-tool'
import type { WebSearchToolConfig } from './web-search-tool'

export type OpenRouterTool = FunctionTool | WebSearchToolConfig

export function convertToolsToProviderFormat(
  tools: Array<Tool>,
): Array<OpenRouterTool> {
  return tools.map((tool) => {
    // Dispatch on the stable `__kind` brand set by webSearchTool() — not on
    // `tool.name`, which a user can reuse with toolDefinition().
    if (isWebSearchTool(tool)) {
      return convertWebSearchToolToAdapterFormat(tool)
    }
    return convertFunctionToolToAdapterFormat(tool)
  })
}
