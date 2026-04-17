import type {
  ToolTextEditor20250124,
  ToolTextEditor20250429,
  ToolTextEditor20250728,
} from '@anthropic-ai/sdk/resources/messages'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type TextEditorToolConfig =
  | ToolTextEditor20250124
  | ToolTextEditor20250429
  | ToolTextEditor20250728

/** @deprecated Renamed to `TextEditorToolConfig`. Will be removed in a future release. */
export type TextEditorTool = TextEditorToolConfig

export type AnthropicTextEditorTool = ProviderTool<'anthropic', 'text_editor'>

export function convertTextEditorToolToAdapterFormat(
  tool: Tool,
): TextEditorToolConfig {
  const metadata = tool.metadata as TextEditorToolConfig
  return {
    ...metadata,
  }
}

export function textEditorTool<T extends TextEditorToolConfig>(
  config: T,
): AnthropicTextEditorTool {
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'str_replace_editor',
    description: '',
    metadata: config,
  } as unknown as AnthropicTextEditorTool
}
