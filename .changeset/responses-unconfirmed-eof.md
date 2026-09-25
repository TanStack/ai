---
'@tanstack/openai-base': patch
'@tanstack/ai-openrouter': patch
---

Report OpenAI Responses structured output streams that end without `response.completed` as `RUN_ERROR` instead of success. Preserve text already streamed to callers.
