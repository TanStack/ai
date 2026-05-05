import {
  convertCodeExecutionToolToAdapterFormat,
  convertCodeInterpreterToolToAdapterFormat,
} from './code-execution-tool'
import {
  convertCollectionsSearchToolToAdapterFormat,
  convertFileSearchToolToAdapterFormat,
} from './file-search-tool'
import { convertFunctionToolToAdapterFormat } from './function-tool'
import { convertMCPToolToAdapterFormat } from './mcp-tool'
import { convertWebSearchToolToAdapterFormat } from './web-search-tool'
import { convertXSearchToolToAdapterFormat } from './x-search-tool'
import type { GrokTool } from './index'
import type { Tool } from '@tanstack/ai'

/**
 * Converts standard TanStack AI tools to xAI Responses-API tool format.
 *
 * Regular application tools become strict function tools. Grok provider-tool
 * factories set `metadata.type` to a native xAI server-side tool type; those are
 * forwarded in their provider-native shape instead.
 */
export function convertToolsToProviderFormat(
  tools: Array<Tool>,
): Array<GrokTool> {
  return tools.map((tool) => {
    const toolType = (tool.metadata as { type?: string } | undefined)?.type

    switch (toolType) {
      case 'code_execution':
        return convertCodeExecutionToolToAdapterFormat(tool)
      case 'code_interpreter':
        return convertCodeInterpreterToolToAdapterFormat(tool)
      case 'collections_search':
        return convertCollectionsSearchToolToAdapterFormat(tool)
      case 'file_search':
        return convertFileSearchToolToAdapterFormat(tool)
      case 'mcp':
        return convertMCPToolToAdapterFormat(tool)
      case 'web_search':
        return convertWebSearchToolToAdapterFormat(tool)
      case 'x_search':
        return convertXSearchToolToAdapterFormat(tool)
      default:
        return convertFunctionToolToAdapterFormat(tool)
    }
  })
}
