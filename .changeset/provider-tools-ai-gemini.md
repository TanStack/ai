---
'@tanstack/ai-gemini': minor
---

Expose provider-tool factories (`codeExecutionTool`, `fileSearchTool`, `googleSearchTool`, `googleSearchRetrievalTool`, `googleMapsTool`, `urlContextTool`, `computerUseTool`) on a new `/tools` subpath, each returning a branded type gated against the selected model's `supports.tools` list.

Note: `supports.capabilities` entries that described tools (`code_execution`, `file_search`, `grounding_with_gmaps` → renamed `google_maps`, `search_grounding` → renamed `google_search`, `url_context`) have been relocated to the new `supports.tools` field. The `capabilities` array loses those entries. This is a model-meta shape change but not a runtime break.
