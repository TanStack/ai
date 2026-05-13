import { webSearchPreviewTool as baseWebSearchPreviewTool } from '@tanstack/ai-openai-compatible'
import type { ProviderTool } from '@tanstack/ai'
import type { WebSearchPreviewToolConfig } from '@tanstack/ai-openai-compatible'

export {
  type WebSearchPreviewToolConfig,
  type WebSearchPreviewTool,
  convertWebSearchPreviewToolToAdapterFormat,
} from '@tanstack/ai-openai-compatible'

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
