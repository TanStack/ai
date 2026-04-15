---
'@tanstack/ai': patch
'@tanstack/ai-openai': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-ollama': patch
---

fix(ai, ai-openai, ai-gemini, ai-ollama): normalize null tool input to empty object

When a model produces a `tool_use` block with no input, `JSON.parse('null')` returns `null` which fails Zod schema validation and silently kills the agent loop. Normalize null/non-object parsed tool input to `{}` in `executeToolCalls`, `ToolCallManager.completeToolCall`, `ToolCallManager.executeTools`, and the OpenAI/Gemini/Ollama adapter `TOOL_CALL_END` emissions. The Anthropic adapter already had this fix.
