---
'@tanstack/ai-openai': minor
---

Expose provider-tool factories (`webSearchTool`, `webSearchPreviewTool`, `fileSearchTool`, `imageGenerationTool`, `codeInterpreterTool`, `mcpTool`, `computerUseTool`, `localShellTool`, `shellTool`, `applyPatchTool`, `customTool`) on a new `/tools` subpath. Each factory returns a branded type (e.g. `OpenAIWebSearchTool`) gated against the selected model's `supports.tools` list. `supports.tools` was expanded to include `web_search_preview`, `local_shell`, `shell`, `apply_patch`. Existing factory signatures and runtime behavior are unchanged.
