---
'@tanstack/ai-openai': minor
---

Add `openaiCompatible({ baseURL, apiKey, models })` provider-factory and `openaiCompatibleText` one-shot helper (exported from `@tanstack/ai-openai/compatible`) for any OpenAI-Chat-Completions-compatible endpoint — DeepSeek, Moonshot/Kimi, Together, Fireworks, Cerebras, Qwen, Perplexity, local servers, and more. Per-model type safety via a hybrid `models` array (bare strings get optimistic defaults; `createModel()` defs declare precise capabilities), with an optional `api: 'responses'` toggle.
