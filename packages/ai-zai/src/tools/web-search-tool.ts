import { brandProviderTool } from '@tanstack/ai'
import type { ProviderTool, Tool } from '@tanstack/ai'
import type { ZAIProviderToolKind } from '../model-meta'

export type ZAIProviderTool<TKind extends ZAIProviderToolKind> = ProviderTool<
  'zai',
  TKind
>

export interface ZAIWebSearchToolConfig {
  type: 'web_search'
  web_search: {
    enable?: boolean
    search_query?: string
    search_result?: boolean
  }
}

export type ZAIServerTool = ZAIWebSearchToolConfig

type ZAIProviderToolMetadata<TKind extends ZAIProviderToolKind> = Extract<
  ZAIServerTool,
  { type: TKind }
> & {
  __kind: `zai.${TKind}`
}

/**
 * Creates Z.AI's built-in web search tool. The provider runs the search; the
 * model sees the results.
 *
 * @see https://docs.z.ai/api-reference/llm/chat-completion
 */
export function zaiWebSearchTool(
  config: ZAIWebSearchToolConfig['web_search'] = {},
): ZAIProviderTool<'web_search'> {
  return brandProviderTool<ZAIProviderTool<'web_search'>>({
    name: 'web_search',
    description: 'Search the web',
    metadata: {
      __kind: 'zai.web_search',
      type: 'web_search',
      web_search: { enable: true, ...config },
    },
  })
}

export function getZAIProviderToolKind(
  tool: Tool,
): ZAIProviderToolKind | undefined {
  const kind = (tool.metadata as { __kind?: unknown } | undefined)?.__kind
  return kind === 'zai.web_search' ? 'web_search' : undefined
}

export function convertZAIProviderToolToAdapterFormat(
  tool: Tool,
  kind: ZAIProviderToolKind,
): ZAIServerTool {
  const metadata = tool.metadata as ZAIProviderToolMetadata<typeof kind>
  if (metadata?.type !== kind) {
    throw new Error(
      `convertZAIProviderToolToAdapterFormat: tool "${tool.name}" has mismatched Z.AI tool metadata.`,
    )
  }
  const { __kind: _kind, ...toolConfig } = metadata
  void _kind
  return toolConfig
}
