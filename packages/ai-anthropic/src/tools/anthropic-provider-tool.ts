import { brandProviderTool } from '@tanstack/ai'
import type { ProviderTool, Tool } from '@tanstack/ai'

const ANTHROPIC_PROVIDER_TOOL_KINDS = {
  bash: 'anthropic.bash',
  code_execution: 'anthropic.code_execution',
  computer_use: 'anthropic.computer_use',
  memory: 'anthropic.memory',
  text_editor: 'anthropic.text_editor',
  web_fetch: 'anthropic.web_fetch',
  web_search: 'anthropic.web_search',
} as const

type AnthropicProviderToolKind = keyof typeof ANTHROPIC_PROVIDER_TOOL_KINDS

export function brandAnthropicProviderTool<
  T extends ProviderTool<'anthropic', AnthropicProviderToolKind>,
>(tool: Omit<T, '~provider' | '~toolKind'>, toolKind: T['~toolKind']): T {
  return brandProviderTool<T>({
    ...tool,
    metadata: {
      ...tool.metadata,
      __kind: ANTHROPIC_PROVIDER_TOOL_KINDS[toolKind],
    },
  })
}

export function getAnthropicProviderToolKind(
  tool: Tool,
): AnthropicProviderToolKind | undefined {
  const toolKind = tool.metadata?.['__kind']
  switch (toolKind) {
    case 'anthropic.bash':
      return 'bash'
    case 'anthropic.code_execution':
      return 'code_execution'
    case 'anthropic.computer_use':
      return 'computer_use'
    case 'anthropic.memory':
      return 'memory'
    case 'anthropic.text_editor':
      return 'text_editor'
    case 'anthropic.web_fetch':
      return 'web_fetch'
    case 'anthropic.web_search':
      return 'web_search'
    default:
      return undefined
  }
}

/** Returns adapter metadata without the internal runtime discriminator. */
export function getAnthropicProviderToolMetadata(tool: Tool): Tool['metadata'] {
  if (!tool.metadata) {
    return undefined
  }
  const { __kind: _kind, ...metadata } = tool.metadata
  void _kind
  return metadata
}
