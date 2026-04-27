import type { BetaWebFetchTool20250910 } from '@anthropic-ai/sdk/resources/beta'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type WebFetchToolConfig = BetaWebFetchTool20250910

/** @deprecated Renamed to `WebFetchToolConfig`. Will be removed in a future release. */
export type WebFetchTool = WebFetchToolConfig

export type AnthropicWebFetchTool = ProviderTool<'anthropic', 'web_fetch'>

export function convertWebFetchToolToAdapterFormat(
  tool: Tool,
): WebFetchToolConfig {
  const metadata = tool.metadata as Omit<WebFetchToolConfig, 'type' | 'name'>
  return {
    name: 'web_fetch',
    type: 'web_fetch_20250910',
    ...metadata,
  }
}

export function webFetchTool(
  config?: Omit<WebFetchToolConfig, 'type' | 'name'>,
): AnthropicWebFetchTool {
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'web_fetch',
    description: '',
    metadata: config,
  } as unknown as AnthropicWebFetchTool
}
