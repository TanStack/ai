import { webSearchTool as baseWebSearchTool } from '@tanstack/ai-openai-compatible'
import type { ProviderTool } from '@tanstack/ai'
import type { WebSearchToolConfig } from '@tanstack/ai-openai-compatible'

export {
  type WebSearchToolConfig,
  type WebSearchTool,
  convertWebSearchToolToAdapterFormat,
} from '@tanstack/ai-openai-compatible'

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
