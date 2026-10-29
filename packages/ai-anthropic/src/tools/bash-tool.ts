import {
  brandAnthropicProviderTool,
  getAnthropicProviderToolMetadata,
} from './anthropic-provider-tool'
import type {
  BetaToolBash20241022,
  BetaToolBash20250124,
} from '@anthropic-ai/sdk/resources/beta'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type BashToolConfig = BetaToolBash20241022 | BetaToolBash20250124

export type AnthropicBashTool = ProviderTool<'anthropic', 'bash'>

export function convertBashToolToAdapterFormat(tool: Tool): BashToolConfig {
  const metadata = getAnthropicProviderToolMetadata(tool) as BashToolConfig
  return metadata
}

export function bashTool(config: BashToolConfig): AnthropicBashTool {
  return brandAnthropicProviderTool<AnthropicBashTool>(
    {
      name: 'bash',
      description: '',
      metadata: config,
    },
    'bash',
  )
}
