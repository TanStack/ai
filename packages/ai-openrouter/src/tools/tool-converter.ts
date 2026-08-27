import { convertFunctionToolToAdapterFormat } from './function-tool'
import {
  convertWebSearchToolToAdapterFormat,
  isWebSearchTool,
} from './web-search-tool'
import {
  convertWebFetchToolToAdapterFormat,
  isWebFetchTool,
} from './web-fetch-tool'
import { assertUniqueToolNames } from '@tanstack/ai/adapter-internals'
import type { Tool } from '@tanstack/ai'
import type { FunctionTool } from './function-tool'
import type { WebSearchToolConfig } from './web-search-tool'
import type { WebFetchToolConfig } from './web-fetch-tool'

export type OpenRouterTool =
  | FunctionTool
  | WebSearchToolConfig
  | WebFetchToolConfig

export function convertToolsToProviderFormat(
  tools: Array<Tool>,
): Array<OpenRouterTool> {
  assertUniqueToolNames(tools)
  return tools.map((tool) => {
    if (isWebSearchTool(tool)) {
      return convertWebSearchToolToAdapterFormat(tool)
    }
    if (isWebFetchTool(tool)) {
      return convertWebFetchToolToAdapterFormat(tool)
    }
    return convertFunctionToolToAdapterFormat(tool)
  })
}
