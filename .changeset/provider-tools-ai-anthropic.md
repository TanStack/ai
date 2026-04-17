---
'@tanstack/ai-anthropic': patch
---

Expose provider-tool factories (`webSearchTool`, `codeExecutionTool`, `computerUseTool`, `bashTool`, `textEditorTool`, `webFetchTool`, `memoryTool`, `customTool`) on a new `/tools` subpath. Each factory now returns a branded type (e.g. `AnthropicWebSearchTool`) that is gated against the selected model's `supports.tools` list. Existing factory signatures and runtime behavior are unchanged; old config-type aliases (`WebSearchTool`, `BashTool`, etc.) remain as `@deprecated` aliases pointing at the renamed `*ToolConfig` types.
