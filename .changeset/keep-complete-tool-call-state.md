---
'@tanstack/ai': patch
---

Keep a tool-call part at `complete` when its result arrives before the stream ends. If a stream had no `TOOL_CALL_END`, the end-of-stream safety net set a finished tool-call part back to `input-complete`. The final state then depended on async timing.
