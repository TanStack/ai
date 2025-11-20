import { ToolTextEditor20250124, ToolTextEditor20250429, ToolTextEditor20250728 } from "@anthropic-ai/sdk/resources/messages";
import type { CacheControl } from "../text/text-provider-options";
import type { Tool } from "@tanstack/ai";

export type TextEditorTool = ToolTextEditor20250124 | ToolTextEditor20250429 | ToolTextEditor20250728

export function createTextEditorTool<T extends TextEditorTool>(config: T): T {
  return config
}

export function convertTextEditorToolToAdapterFormat(tool: Tool): TextEditorTool {
  const metadata = tool.metadata as TextEditorTool
  return {
    ...metadata,

  }
}

export function textEditorTool<T extends TextEditorTool>(config: T): Tool {
  return {
    type: "function",
    function: {
      name: "str_replace_editor",
      description: "",
      parameters: {}
    },
    metadata: config
  }
}

export interface TextEditor {
  name: "str_replace_based_edit_tool";
  type: "text_editor_20250728";
  cache_control?: CacheControl | null
  max_characters?: number | null;
}