import { convertFunctionToolToAdapterFormat } from './function-tool'
import type { FunctionTool } from './function-tool'
import type { Tool } from '@tanstack/ai'

/**
 * Converts an array of standard Tools to Groq-specific format.
 * Groq uses an OpenAI-compatible API, so we primarily support function tools.
 */
export function convertToolsToProviderFormat(
    tools: Array<Tool>,
): Array<FunctionTool> {
    return tools.map((tool) => {
        return convertFunctionToolToAdapterFormat(tool)
    })
}
