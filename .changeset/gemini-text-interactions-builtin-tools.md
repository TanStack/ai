---
'@tanstack/ai-gemini': minor
---

feat(ai-gemini): built-in tools on `geminiTextInteractions()`

`google_search`, `code_execution`, `url_context`, `file_search`, and `computer_use` now work through the stateful Interactions adapter — previously these threw because the Interactions API uses snake*case tool shapes that differ from `client.models.generateContent`. Built-in tool activity is surfaced as AG-UI `CUSTOM` events named `gemini.googleSearchCall` / `gemini.googleSearchResult` (and the matching `codeExecution*`, `urlContext*`, `fileSearch*`variants), carrying the raw Interactions delta payload. Function-tool`TOOL_CALL\*\*`events are unchanged, and`finishReason`stays`stop` when only built-in tools run — the core chat loop has nothing to execute.

`google_search_retrieval`, `google_maps`, and `mcp_server` remain unsupported on this adapter and throw a targeted error explaining the alternative.
