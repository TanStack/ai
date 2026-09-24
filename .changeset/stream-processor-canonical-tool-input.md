---
'@tanstack/ai': patch
---

fix: `StreamProcessor` writes `TOOL_CALL_END.input` into the tool-call part's `arguments` even when argument deltas were streamed, so `arguments` and `input` agree on the persisted part (a strict-mode OpenAI call no longer keeps the widened `null`s the adapter already removed).
