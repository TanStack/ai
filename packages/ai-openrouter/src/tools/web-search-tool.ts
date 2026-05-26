import { brandProviderTool } from '@tanstack/ai'
import type { OpenRouterWebSearchServerTool } from '@openrouter/sdk/models'
import type { ProviderTool, Tool } from '@tanstack/ai'

/**
 * Stable runtime marker used to identify a `webSearchTool()`-created tool so
 * `convertToolsToProviderFormat` can route it without relying on the mutable
 * public `tool.name`.
 */
export const WEB_SEARCH_TOOL_KIND = 'openrouter.web_search'

/**
 * Wire shape for OpenRouter's `openrouter:web_search` server tool, sourced
 * directly from `@openrouter/sdk`'s `OpenRouterWebSearchServerTool` so the
 * SDK's outbound Zod schema preserves every field on the wire.
 *
 * @see https://openrouter.ai/docs/guides/features/server-tools/web-search
 */
export type WebSearchToolConfig = OpenRouterWebSearchServerTool

/** @deprecated Renamed to `WebSearchToolConfig`. Will be removed in a future release. */
export type WebSearchTool = WebSearchToolConfig

export type OpenRouterWebSearchTool = ProviderTool<'openrouter', 'web_search'>

/** A tool is a webSearchTool() output iff its metadata carries our branded kind marker. */
export function isWebSearchTool(tool: Tool): boolean {
  const kind = (tool.metadata as { __kind?: unknown } | undefined)?.__kind
  return kind === WEB_SEARCH_TOOL_KIND
}

/**
 * Converts a branded web-search tool to OpenRouter's wire format. Throws if
 * the metadata doesn't match the expected shape — callers must gate on
 * `isWebSearchTool()` first.
 */
export function convertWebSearchToolToAdapterFormat(
  tool: Tool,
): WebSearchToolConfig {
  const metadata = tool.metadata as
    | {
        __kind?: unknown
        parameters?: OpenRouterWebSearchServerTool['parameters']
      }
    | undefined
  if (!metadata || metadata.__kind !== WEB_SEARCH_TOOL_KIND) {
    throw new Error(
      `convertWebSearchToolToAdapterFormat: tool "${tool.name}" is not a valid webSearchTool() output (missing branded metadata).`,
    )
  }
  return {
    type: 'openrouter:web_search',
    ...(metadata.parameters !== undefined && {
      parameters: metadata.parameters,
    }),
  }
}

/**
 * Creates a branded web search tool for use with OpenRouter models.
 *
 * The web search tool is available across all OpenRouter chat models via the
 * OpenRouter gateway. Pass the returned value in the `tools` array when
 * calling a chat function.
 *
 * Note: prior versions accepted a `searchPrompt` option that was silently
 * dropped on the wire. The SDK's `WebSearchConfig` does not model that field;
 * use `maxResults`, `searchContextSize`, or `userLocation` to tune the call.
 */
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
