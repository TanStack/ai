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
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'web_search_preview',
    description: 'Search the web (preview version)',
    metadata: toolData,
  } as unknown as OpenAIWebSearchPreviewTool
}
