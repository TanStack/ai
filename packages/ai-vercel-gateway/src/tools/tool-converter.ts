import { convertFunctionToolToAdapterFormat } from './function-tool'
import type { FunctionTool } from './function-tool'
import type { Tool } from '@tanstack/ai'

/**
 * Converts an array of standard Tools to Vercel AI Gateway format.
 * The Gateway Chat Completions API is OpenAI-compatible, so we support function tools.
 */
export function convertToolsToProviderFormat(
  tools: Array<Tool>,
): Array<FunctionTool> {
  return tools.map((tool) => {
    return convertFunctionToolToAdapterFormat(tool)
  })
}
