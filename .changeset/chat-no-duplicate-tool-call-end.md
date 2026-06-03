---
'@tanstack/ai': patch
---

Fix duplicate `TOOL_CALL_END` for server-executed tools. The adapter already streams `START`/`ARGS`/`END` for each tool call, but `chat()` emitted a second `END` afterwards with no matching `START` — an orphan event that AG-UI-strict consumers (e.g. `@ag-ui/client`'s `verifyEvents`) reject. The post-execution phase now only adds `TOOL_CALL_RESULT`. Fixes #519.
