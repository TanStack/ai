import { brandProviderTool } from '@tanstack/ai'
import type { ProviderTool, Tool } from '@tanstack/ai'

/**
 * Stable runtime marker used to identify a `webFetchTool()`-created tool so
 * `convertToolsToProviderFormat` can route it without relying on the mutable
 * public `tool.name`.
 */
export const WEB_FETCH_TOOL_KIND = 'openrouter.web_fetch'

/**
 * OpenRouter `openrouter:web_fetch` server-tool wire shape.
 *
 * Mirrors the nested shape used by {@link WebSearchToolConfig} — the
 * `@openrouter/sdk` does not yet declare an input type for `web_fetch`, only
 * the output item (`OutputWebFetchServerToolItem`). If OpenRouter requires the
 * flat `{type: "openrouter:web_fetch", ...}` namespacing shown in their
 * announcement, both this and `webSearchTool()` should be flipped together to
 * keep the package consistent.
 *
 * @see https://openrouter.ai/announcements/agentic-web-tools
 */
export interface WebFetchToolConfig {
  type: 'web_fetch'
  web_fetch: {
    engine?: 'auto' | 'native' | 'openrouter' | 'exa' | 'parallel'
    max_content_tokens?: number
    allowed_domains?: Array<string>
    blocked_domains?: Array<string>
  }
}

export type OpenRouterWebFetchTool = ProviderTool<'openrouter', 'web_fetch'>

/** A tool is a webFetchTool() output iff its metadata carries our branded kind marker. */
export function isWebFetchTool(tool: Tool): boolean {
  const kind = (tool.metadata as { __kind?: unknown } | undefined)?.__kind
  return kind === WEB_FETCH_TOOL_KIND
}

/**
 * Converts a branded web-fetch tool to OpenRouter's wire format. Throws if
 * the metadata doesn't match the expected shape — callers must gate on
 * `isWebFetchTool()` first.
 */
export function convertWebFetchToolToAdapterFormat(
  tool: Tool,
): WebFetchToolConfig {
  const metadata = tool.metadata as
    | {
        __kind?: unknown
        type?: unknown
        web_fetch?: unknown
      }
    | undefined
  if (
    !metadata ||
    metadata.__kind !== WEB_FETCH_TOOL_KIND ||
    metadata.type !== 'web_fetch' ||
    typeof metadata.web_fetch !== 'object' ||
    metadata.web_fetch === null ||
    Array.isArray(metadata.web_fetch)
  ) {
    throw new Error(
      `convertWebFetchToolToAdapterFormat: tool "${tool.name}" is not a valid webFetchTool() output (missing branded metadata).`,
    )
  }
  return {
    type: 'web_fetch',
    web_fetch: metadata.web_fetch,
  }
}

/**
 * Creates a branded web fetch tool for use with OpenRouter models.
 *
 * The web fetch tool is available across all OpenRouter chat models via the
 * OpenRouter gateway. The model decides which URL to fetch; the `engine`
 * option chooses how OpenRouter retrieves it. With `engine: 'native'` the
 * provider's own fetch is used (e.g. Anthropic's web_fetch on Claude models),
 * in which case `allowed_domains` / `blocked_domains` may not be respected.
 *
 * Pass the returned value in the `tools` array when calling a chat function.
 */
export function webFetchTool(options?: {
  engine?: 'auto' | 'native' | 'openrouter' | 'exa' | 'parallel'
  maxContentTokens?: number
  allowedDomains?: Array<string>
  blockedDomains?: Array<string>
}): OpenRouterWebFetchTool {
  return brandProviderTool<OpenRouterWebFetchTool>({
    name: 'web_fetch',
    description: '',
    metadata: {
      __kind: WEB_FETCH_TOOL_KIND,
      type: 'web_fetch' as const,
      web_fetch: {
        engine: options?.engine,
        max_content_tokens: options?.maxContentTokens,
        allowed_domains: options?.allowedDomains,
        blocked_domains: options?.blockedDomains,
      },
    },
  })
}
