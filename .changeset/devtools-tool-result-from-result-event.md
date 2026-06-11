---
'@tanstack/ai-event-client': patch
---

Surface server-executed tool results in devtools from the `TOOL_CALL_RESULT` event. The devtools middleware previously read results only off `TOOL_CALL_END`, which the adapter emits before the tool runs (so it carries no result). Now that `chat()` no longer re-emits a post-execution `TOOL_CALL_END` (see the `@tanstack/ai` #519 fix), results travel on the spec-compliant `TOOL_CALL_RESULT` event — the middleware now handles it so devtools keeps showing server-tool output.
