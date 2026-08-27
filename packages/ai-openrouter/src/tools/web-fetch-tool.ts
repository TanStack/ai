import { brandProviderTool } from '@tanstack/ai'
import type { WebFetchServerTool } from '@openrouter/sdk/models'
import type { ProviderTool, Tool } from '@tanstack/ai'

export const WEB_FETCH_TOOL_KIND = 'openrouter.web_fetch'

export type WebFetchToolConfig = WebFetchServerTool

export type OpenRouterWebFetchTool = ProviderTool<'openrouter', 'web_fetch'>

/** A tool is a webFetchTool() output iff its metadata carries our branded kind marker. */
export function isWebFetchTool(tool: Tool): boolean {
  const kind = (tool.metadata as { __kind?: unknown } | undefined)?.__kind
  return kind === WEB_FETCH_TOOL_KIND
}

export function convertWebFetchToolToAdapterFormat(
  tool: Tool,
): WebFetchToolConfig {
  const metadata = tool.metadata as
    | {
        __kind?: unknown
        parameters?: WebFetchServerTool['parameters']
      }
    | undefined
  if (metadata?.__kind !== WEB_FETCH_TOOL_KIND) {
    throw new Error(
      `convertWebFetchToolToAdapterFormat: tool "${tool.name}" is not a valid webFetchTool() output (missing branded metadata).`,
    )
  }
  return {
    type: 'openrouter:web_fetch',
    ...(metadata?.parameters !== undefined && {
      parameters: metadata.parameters,
    }),
  }
}

export function webFetchTool(
  options?: WebFetchServerTool['parameters'],
): OpenRouterWebFetchTool {
  return brandProviderTool<OpenRouterWebFetchTool>({
    name: 'web_fetch',
    description: '',
    metadata: {
      __kind: WEB_FETCH_TOOL_KIND,
      ...(options !== undefined && { parameters: options }),
    },
  })
}
