---
'@tanstack/ai': patch
'@tanstack/ai-openai': patch
---

fix(ai, ai-openai): normalize null tool input to empty object

When a model produces a `tool_use` block with no input, `JSON.parse('null')` returns `null` which fails Zod schema validation and silently kills the agent loop. Normalize null/non-object parsed tool input to `{}` in `executeToolCalls`, `ToolCallManager.completeToolCall`, `ToolCallManager.executeTools`, and the OpenAI adapter's `TOOL_CALL_END` emission.
