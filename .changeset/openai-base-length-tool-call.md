---
'@tanstack/openai-base': patch
---

Keep `finishReason: "length"` when Chat Completions cuts off a tool call. The run no longer reports `tool_calls` or sends the unfinished arguments back to the model.
