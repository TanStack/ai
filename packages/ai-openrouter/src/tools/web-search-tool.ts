import { brandProviderTool } from '@tanstack/ai'
import type { OpenRouterWebSearchServerTool } from '@openrouter/sdk/models'
import type { ProviderTool, Tool } from '@tanstack/ai'

export const WEB_SEARCH_TOOL_KIND = 'openrouter.web_search'

export type WebSearchToolConfig = OpenRouterWebSearchServerTool

/** @deprecated Renamed to `WebSearchToolConfig`. Will be removed in a future release. */
export type WebSearchTool = WebSearchToolConfig

export type OpenRouterWebSearchTool = ProviderTool<'openrouter', 'web_search'>

/** A tool is a webSearchTool() output iff its metadata carries our branded kind marker. */
export function isWebSearchTool(tool: Tool): boolean {
  const kind = (tool.metadata as { __kind?: unknown } | undefined)?.__kind
  return kind === WEB_SEARCH_TOOL_KIND
}

export function convertWebSearchToolToAdapterFormat(
  tool: Tool,
): WebSearchToolConfig {
  const metadata = tool.metadata as
    | {
        __kind?: unknown
        parameters?: OpenRouterWebSearchServerTool['parameters']
      }
    | undefined
  if (metadata?.__kind !== WEB_SEARCH_TOOL_KIND) {
    throw new Error(
      `convertWebSearchToolToAdapterFormat: tool "${tool.name}" is not a valid webSearchTool() output (missing branded metadata).`,
    )
  }
  return {
    type: 'openrouter:web_search',
    ...(metadata?.parameters !== undefined && {
      parameters: metadata.parameters,
    }),
  }
}

export function webSearchTool(
  options?: OpenRouterWebSearchServerTool['parameters'],
): OpenRouterWebSearchTool {
  return brandProviderTool<OpenRouterWebSearchTool>({
    name: 'web_search',
    description: '',
    metadata: {
      __kind: WEB_SEARCH_TOOL_KIND,
      ...(options !== undefined && { parameters: options }),
    },
  })
}
