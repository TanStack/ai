import type OpenAI from 'openai'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type WebSearchToolConfig = OpenAI.Responses.WebSearchTool
export type WebSearchToolOptions = Omit<WebSearchToolConfig, 'type'>

/** @deprecated Renamed to `WebSearchToolConfig`. Will be removed in a future release. */
export type WebSearchTool = WebSearchToolConfig

export type GrokWebSearchTool = ProviderTool<'grok', 'web_search'>

export function convertWebSearchToolToAdapterFormat(
  tool: Tool,
): WebSearchToolConfig {
  return tool.metadata as WebSearchToolConfig
}

export function webSearchTool(
  toolData: WebSearchToolOptions = {},
): GrokWebSearchTool {
  return {
    name: 'web_search',
    description: 'Search the web',
    metadata: { type: 'web_search', ...toolData },
  } as unknown as GrokWebSearchTool
}
