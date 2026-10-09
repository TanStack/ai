---
'@tanstack/openai-base': patch
---

The Chat Completions adapter now stops the run with a `RUN_ERROR` when a stream chunk has an object or an array in `delta.content`. Before, the adapter streamed that value as the text `[object Object]` and finished the run. Null or missing `delta.content` still adds no text, and tool calls in the same chunk still run.
