import {
  getOpenAIProviderToolMetadata,
  openAIProviderTool,
} from './openai-provider-tool'
import type { WebSearchTool as WebSearchToolConfig } from 'openai/resources/responses/responses'
import type { Tool } from '@tanstack/ai'

export type { WebSearchToolConfig }

/** @deprecated Renamed to `WebSearchToolConfig`. Will be removed in a future release. */
export type WebSearchTool = WebSearchToolConfig

/**
 * Converts a standard Tool to OpenAI WebSearchTool format. Spread `metadata`
 * first, then force `type: 'web_search'` last so a different metadata type
 * cannot produce a malformed payload.
 */
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

/**
 * Creates a standard Tool from WebSearchTool parameters.
 *
 * Base (non-branded) factory. Providers that need branded return types should
 * re-wrap this in their own package.
 */
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
