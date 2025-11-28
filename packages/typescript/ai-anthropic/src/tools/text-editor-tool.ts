
import type {
  ToolTextEditor20250124,
  ToolTextEditor20250429,
  ToolTextEditor20250728,
} from '@anthropic-ai/sdk/resources/messages'
import type { Tool } from '@tanstack/ai'

export type TextEditorTool =
  | ToolTextEditor20250124
  | ToolTextEditor20250429
  | ToolTextEditor20250728

export function convertTextEditorToolToAdapterFormat(
  tool: Tool,
): TextEditorTool {
  const metadata = tool.metadata as TextEditorTool
  return {
    ...metadata,
  }
}

export function textEditorTool<T extends TextEditorTool>(config: T): Tool {
  return {
    name: 'str_replace_editor',
    description: '',
    metadata: config,
  }
}
