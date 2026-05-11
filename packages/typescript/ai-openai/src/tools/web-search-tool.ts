import { webSearchTool as baseWebSearchTool } from '@tanstack/openai-base'
import type { ProviderTool } from '@tanstack/ai'
import type { WebSearchToolConfig } from '@tanstack/openai-base'

export {
  type WebSearchToolConfig,
  type WebSearchTool,
  convertWebSearchToolToAdapterFormat,
} from '@tanstack/openai-base'

export type OpenAIWebSearchTool = ProviderTool<'openai', 'web_search'>

/**
 * Creates a standard Tool from WebSearchTool parameters, branded as an OpenAI
 * provider tool.
 */
export function webSearchTool(
  toolData: WebSearchToolConfig,
): OpenAIWebSearchTool {
  return baseWebSearchTool(toolData) as OpenAIWebSearchTool
}
