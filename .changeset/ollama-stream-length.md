---
'@tanstack/ai-ollama': patch
---

Preserve Ollama's `done_reason: "length"` in streamed chat completions, including turns with tool calls, so truncated output does not execute tools.
