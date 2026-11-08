---
'@tanstack/ai-mistral': patch
---

A Mistral chat stream that hits the token limit during a tool call now reports `finishReason: 'length'` on `RUN_FINISHED`. Before, it reported `tool_calls`. The cut call ends with `TOOL_CALL_END` carrying the raw `args` and no `input`, so the stream no longer throws on the incomplete JSON. A `tool_calls` finish with malformed arguments still throws.
