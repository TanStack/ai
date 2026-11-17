---
'@tanstack/ai-mistral': patch
---

A Mistral chat stream that hits the token limit during a tool call reports `finishReason: 'length'`. Complete arguments are normalized onto `input`. Incomplete arguments keep the raw `args` and omit `input`, and the stream does not throw. A `tool_calls` finish with malformed arguments still throws.
