import { brandProviderTool } from '@tanstack/ai'
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
  return brandProviderTool<AnthropicBashTool>({
    name: 'bash',
    description: '',
    metadata: config,
  })
}
