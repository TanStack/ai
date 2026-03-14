import { convertBashToolToAdapterFormat } from './bash-tool'
import { convertCodeExecutionToolToAdapterFormat } from './code-execution-tool'
import { convertComputerUseToolToAdapterFormat } from './computer-use-tool'
import { convertCustomToolToAdapterFormat } from './custom-tool'
import { convertMemoryToolToAdapterFormat } from './memory-tool'
import { convertTextEditorToolToAdapterFormat } from './text-editor-tool'
import { convertWebFetchToolToAdapterFormat } from './web-fetch-tool'
import { convertWebSearchToolToAdapterFormat } from './web-search-tool'
import type { ToolUnion } from '@anthropic-ai/sdk/resources/messages'
import type { Tool } from '@tanstack/ai'

/**
 * Converts standard Tool format to Anthropic-specific tool format.
 *
 * @param tools - Array of standard Tool objects
 * @returns Array of Anthropic-specific tool definitions
 *
 * @example
 * ```typescript
 * const tools: Tool[] = [{
 *   type: "function",
 *   function: {
 *     name: "get_weather",
 *     description: "Get weather for a location",
 *     parameters: {
 *       type: "object",
 *       properties: { location: { type: "string" } },
 *       required: ["location"]
 *     }
 *   }
 * }];
 *
 * const anthropicTools = convertToolsToProviderFormat(tools);
 * ```
 * 
 * Returns Array<ToolUnion> for compatibility with the stable messages API.
 * Beta-only tools (ComputerUse, CodeExecution, Memory, WebFetch) are
 * structurally compatible at runtime but not part of the GA ToolUnion type.
 */
export function convertToolsToProviderFormat<TTool extends Tool>(
  tools: Array<TTool>,
): Array<ToolUnion> {
  return tools.map((tool) => {
    const name = tool.name

    switch (name) {
      case 'bash':
        return convertBashToolToAdapterFormat(tool)
      case 'code_execution':
        return convertCodeExecutionToolToAdapterFormat(tool)
      case 'computer':
        return convertComputerUseToolToAdapterFormat(tool)
      case 'memory':
        return convertMemoryToolToAdapterFormat(tool)
      case 'str_replace_editor':
        return convertTextEditorToolToAdapterFormat(tool)
      case 'web_fetch':
        return convertWebFetchToolToAdapterFormat(tool)
      case 'web_search':
        return convertWebSearchToolToAdapterFormat(tool)
      default:
        return convertCustomToolToAdapterFormat(tool)
    }
  }) as Array<ToolUnion>
}
