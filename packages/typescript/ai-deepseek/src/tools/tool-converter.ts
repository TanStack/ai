import { convertFunctionToolToAdapterFormat } from './function-tool'
import type { FunctionTool } from './function-tool'
import type { Tool } from '@tanstack/ai'

/**
 * Converts an array of standard Tools to DeepSeek-specific format
 * DeepSeek uses OpenAI-compatible API, so we primarily support function tools
 */
export function convertToolsToProviderFormat(
  tools: Array<Tool>,
): Array<FunctionTool> {
  return tools.map((tool) => {
    // For DeepSeek, all tools are converted as function tools
    // DeepSeek uses OpenAI-compatible API which primarily supports function tools
    return convertFunctionToolToAdapterFormat(tool)
  })
}
