import { assertUniqueToolNames } from '@tanstack/ai/adapter-internals'
import { convertFunctionToolToChatCompletionsFormat } from '@tanstack/openai-base'
import {
  convertZAIProviderToolToAdapterFormat,
  getZAIProviderToolKind,
} from './web-search-tool'
import type { ChatCompletionFunctionTool } from '@tanstack/openai-base'
import type { Tool } from '@tanstack/ai'
import type { ZAIServerTool } from './web-search-tool'

export type ZAITool = ZAIServerTool | ChatCompletionFunctionTool

/**
 * Converts TanStack tools to the Z.AI Chat Completions tool format. Provider
 * tools (from `zaiWebSearchTool()`) keep their native shape; everything else
 * becomes an OpenAI-style function tool.
 */
export function convertToolsToProviderFormat(
  tools: Array<Tool>,
): Array<ZAITool> {
  assertUniqueToolNames(tools)
  return tools.map((tool) => {
    const kind = getZAIProviderToolKind(tool)
    return kind
      ? convertZAIProviderToolToAdapterFormat(tool, kind)
      : convertFunctionToolToChatCompletionsFormat(tool)
  })
}
