---
'@tanstack/ai-ollama': patch
---

Report `finishReason: "length"` on `RUN_FINISHED` when an Ollama stream ends with `done_reason: "length"`. This includes a reply cut by `num_predict`, and a tool call cut the same way. A normal stop stays `"stop"`. A finished tool call stays `"tool_calls"`.
