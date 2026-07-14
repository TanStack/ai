import { brandProviderTool } from '@tanstack/ai'
import type { ProviderTool, Tool } from '@tanstack/ai'

const ANTHROPIC_PROVIDER_TOOL_KIND = Symbol.for(
  '@tanstack/ai-anthropic/provider-tool-kind',
)

const ANTHROPIC_PROVIDER_TOOL_KINDS = {
  bash: true,
  code_execution: true,
  computer_use: true,
  memory: true,
  text_editor: true,
  web_fetch: true,
  web_search: true,
} as const

type AnthropicProviderToolKind = keyof typeof ANTHROPIC_PROVIDER_TOOL_KINDS

type RuntimeAnthropicProviderTool = Tool & {
  [ANTHROPIC_PROVIDER_TOOL_KIND]?: unknown
}

/**
 * Adds a stable runtime discriminator to an Anthropic-native tool.
 *
 * The core ProviderTool brand is intentionally type-only. Anthropic also needs
 * a runtime discriminator because custom functions may use the same public
 * names as native tools. A symbol keeps this marker off the provider wire, and
 * Symbol.for keeps it stable if multiple copies of this package are loaded.
 */
export function brandAnthropicProviderTool<
  T extends ProviderTool<'anthropic', AnthropicProviderToolKind>,
>(tool: Omit<T, '~provider' | '~toolKind'>, toolKind: T['~toolKind']): T {
  const brandedTool = brandProviderTool<T>(tool)
  Object.defineProperty(brandedTool, ANTHROPIC_PROVIDER_TOOL_KIND, {
    value: toolKind,
    enumerable: true,
  })
  return brandedTool
}

export function getAnthropicProviderToolKind(
  tool: Tool,
): AnthropicProviderToolKind | undefined {
  const toolKind = (tool as RuntimeAnthropicProviderTool)[
    ANTHROPIC_PROVIDER_TOOL_KIND
  ]
  if (
    typeof toolKind !== 'string' ||
    !(toolKind in ANTHROPIC_PROVIDER_TOOL_KINDS)
  ) {
    return undefined
  }
  return toolKind as AnthropicProviderToolKind
}
