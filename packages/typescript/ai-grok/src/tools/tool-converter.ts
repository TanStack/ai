import { convertFunctionToolToAdapterFormat } from './function-tool'
import type { FunctionTool } from './function-tool'
import type { Tool } from '@tanstack/ai'

/**
 * Converts an array of standard Tools to Grok-specific format
 * Grok uses OpenAI-compatible API, so we primarily support function tools
 */
export function convertToolsToProviderFormat(
  tools: Array<Tool>,
): Array<FunctionTool> {
  return tools.map((tool) => {
    // For Grok, all tools are converted as function tools
    // Grok uses OpenAI-compatible API which primarily supports function tools
    return convertFunctionToolToAdapterFormat(tool)
  })
}
