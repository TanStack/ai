import type { CacheControl } from "../text/text-provider-options";

type TextEditorToolType = "text_editor_20241022" | "text_editor_20250124" | "text_editor_20250429";

export interface TextEditorTool {
  name: "str_replace_editor";
  type: TextEditorToolType;
  cache_control?: CacheControl | null
}

export function createTextEditorTool(type: TextEditorToolType, cacheControl?: CacheControl | null): TextEditorTool {
  return {
    name: "str_replace_editor",
    type,
    cache_control: cacheControl || null
  };
}

export interface TextEditor {
  name: "str_replace_based_edit_tool";
  type: "text_editor_20250728";
  cache_control?: CacheControl | null
  max_characters?: number | null;
}