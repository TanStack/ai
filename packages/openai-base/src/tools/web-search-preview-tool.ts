import {
  getOpenAIProviderToolMetadata,
  openAIProviderTool,
} from './openai-provider-tool'
import type { WebSearchPreviewTool as WebSearchPreviewToolConfig } from 'openai/resources/responses/responses'
import type { Tool } from '@tanstack/ai'

export type { WebSearchPreviewToolConfig }

/** @deprecated Renamed to `WebSearchPreviewToolConfig`. Will be removed in a future release. */
export type WebSearchPreviewTool = WebSearchPreviewToolConfig

export function convertWebSearchPreviewToolToAdapterFormat(
  tool: Tool,
): WebSearchPreviewToolConfig {
  const metadata = getOpenAIProviderToolMetadata(tool) as Omit<
    WebSearchPreviewToolConfig,
    'type'
  >
  return {
    ...metadata,
    type: 'web_search_preview',
  }
}

export function webSearchPreviewTool(
  toolData: WebSearchPreviewToolConfig,
): Tool {
  return openAIProviderTool(
    {
      name: 'web_search_preview',
      description: 'Search the web (preview version)',
      metadata: toolData,
    },
    'web_search_preview',
  )
}
