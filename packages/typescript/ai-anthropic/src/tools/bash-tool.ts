import type {
  BetaToolBash20241022,
  BetaToolBash20250124,
} from '@anthropic-ai/sdk/resources/beta'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type BashToolConfig = BetaToolBash20241022 | BetaToolBash20250124

/** @deprecated Renamed to `BashToolConfig`. Will be removed in a future release. */
export type BashTool = BashToolConfig

export type AnthropicBashTool = ProviderTool<'anthropic', 'bash'>

export function convertBashToolToAdapterFormat(tool: Tool): BashToolConfig {
  const metadata = tool.metadata as BashToolConfig
  return metadata
}

export function bashTool(config: BashToolConfig): AnthropicBashTool {
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'bash',
    description: '',
    metadata: config,
  } as unknown as AnthropicBashTool
}
