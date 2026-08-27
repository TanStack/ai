import {
  getOpenAIProviderToolMetadata,
  openAIProviderTool,
} from './openai-provider-tool'
import type { WebSearchTool as WebSearchToolConfig } from 'openai/resources/responses/responses'
import type { Tool } from '@tanstack/ai'

export type { WebSearchToolConfig }

/** @deprecated Renamed to `WebSearchToolConfig`. Will be removed in a future release. */
export type WebSearchTool = WebSearchToolConfig

export function convertWebSearchToolToAdapterFormat(
  tool: Tool,
): WebSearchToolConfig {
  const metadata = getOpenAIProviderToolMetadata(tool) as Omit<
    WebSearchToolConfig,
    'type'
  >
  return {
    ...metadata,
    type: 'web_search',
  }
}

export function webSearchTool(toolData: WebSearchToolConfig): Tool {
  return openAIProviderTool(
    {
      name: 'web_search',
      description: 'Search the web',
      metadata: toolData,
    },
    'web_search',
  )
}
