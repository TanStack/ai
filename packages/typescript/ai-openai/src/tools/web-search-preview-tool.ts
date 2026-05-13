import { webSearchPreviewTool as baseWebSearchPreviewTool } from '@tanstack/openai-base'
import type { ProviderTool } from '@tanstack/ai'
import type { WebSearchPreviewToolConfig } from '@tanstack/openai-base'

export {
  type WebSearchPreviewToolConfig,
  type WebSearchPreviewTool,
  convertWebSearchPreviewToolToAdapterFormat,
} from '@tanstack/openai-base'

export type OpenAIWebSearchPreviewTool = ProviderTool<
  'openai',
  'web_search_preview'
>

/**
 * Creates a standard Tool from WebSearchPreviewTool parameters, branded as an
 * OpenAI provider tool.
 */
export function webSearchPreviewTool(
  toolData: WebSearchPreviewToolConfig,
): OpenAIWebSearchPreviewTool {
  return baseWebSearchPreviewTool(toolData) as OpenAIWebSearchPreviewTool
}
