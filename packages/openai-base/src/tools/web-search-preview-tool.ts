import type { WebSearchPreviewTool as WebSearchPreviewToolConfig } from 'openai/resources/responses/responses'
import type { Tool } from '@tanstack/ai'

export type { WebSearchPreviewToolConfig }

/** @deprecated Renamed to `WebSearchPreviewToolConfig`. Will be removed in a future release. */
export type WebSearchPreviewTool = WebSearchPreviewToolConfig

/**
 * Converts a standard Tool to OpenAI WebSearchPreviewTool format. Force the
 * literal `type: 'web_search_preview'` instead of trusting `metadata.type`,
 * so a missing or wrong metadata type cannot produce a malformed payload.
 */
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

/**
 * Creates a standard Tool from WebSearchPreviewTool parameters.
 *
 * Base (non-branded) factory. Providers that need branded return types should
 * re-wrap this in their own package.
 */
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
import {
  getOpenAIProviderToolMetadata,
  openAIProviderTool,
} from './openai-provider-tool'
