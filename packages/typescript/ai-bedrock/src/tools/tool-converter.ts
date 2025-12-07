import { convertBashToolToAdapterFormat } from './anthropic-bash-tool'
import { convertCodeExecutionToolToAdapterFormat } from './anthropic-code-execution-tool'
import { convertComputerUseToolToAdapterFormat } from './anthropic-computer-use-tool'
import { convertMemoryToolToAdapterFormat } from './anthropic-memory-tool'
import { convertTextEditorToolToAdapterFormat } from './anthropic-text-editor-tool'
import { convertWebFetchToolToAdapterFormat } from './anthropic-web-fetch-tool'
import { convertWebSearchToolToAdapterFormat } from './anthropic-web-search-tool'
import { convertCustomToolToAdapterFormat } from './custom-tool'
import { isAnthropicModel } from '../model-meta'
import type { Tool } from '@tanstack/ai'
import type { BedrockToolSpec } from './custom-tool'

/**
 * Converts standard Tool format to Bedrock-specific tool format
 *
 * @param tools - Array of standard Tool objects
 * @param modelId - Model ID to determine if Anthropic provider tools are supported.
 *   Supports all Anthropic model ID formats:
 *   - Direct: `anthropic.claude-3-5-sonnet-20241022-v2:0`
 *   - US inference profile: `us.anthropic.claude-3-5-sonnet-20241022-v2:0`
 *   - EU inference profile: `eu.anthropic.claude-3-5-sonnet-20241022-v2:0`
 * @returns Array of Bedrock tool specifications
 *
 * @example
 * ```typescript
 * const tools: Tool[] = [{
 *   name: "get_weather",
 *   description: "Get weather for a location",
 *   inputSchema: z.object({
 *     location: z.string()
 *   })
 * }];
 *
 * const bedrockTools = convertToolsToProviderFormat(tools, 'us.anthropic.claude-3-5-sonnet-20241022-v2:0');
 * ```
 */
export function convertToolsToProviderFormat(
  tools: Array<Tool>,
  modelId: string,
): Array<BedrockToolSpec> {
  const isAnthropic = isAnthropicModel(modelId)

  return tools.map((tool) => {
    const name = tool.name

    if (isAnthropic) {
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
    }

    return convertCustomToolToAdapterFormat(tool)
  })
}
