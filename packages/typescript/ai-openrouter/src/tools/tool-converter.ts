import { convertFunctionToolToAdapterFormat } from './function-tool'
import type { Tool } from '@tanstack/ai'
import type { FunctionTool } from './function-tool'

export type OpenRouterTool = FunctionTool

export function convertToolsToProviderFormat(
  tools: Array<Tool>,
): Array<OpenRouterTool> {
  return tools.map((tool) => convertFunctionToolToAdapterFormat(tool))
}
