import { convertFunctionToolToAdapterFormat } from './function-tool'
import type { Tool } from '@tanstack/ai'
import type { Tool as OllamaTool } from 'ollama'

export function convertToolsToProviderFormat(
  tools?: Array<Tool>,
): Array<OllamaTool> | undefined {
  if (!tools) return undefined
  if (tools.length === 0) {
    return undefined
  }
  return tools.map((tool) => convertFunctionToolToAdapterFormat(tool))
}
