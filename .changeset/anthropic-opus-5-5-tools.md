---
'@tanstack/ai-anthropic': patch
---

Give `claude-opus-5-5` its provider tools and structured output with tools. The model now accepts `webSearchTool()`, `webFetchTool()`, `codeExecutionTool()`, `bashTool()`, `textEditorTool()`, and `memoryTool()`. `computerUseTool()` stays off because this model accepts only `computer_toolset_20260801`. Structured output alongside tools now uses `output_config.format` in one request, and `modelOptions.output_config` is typed for this model.
