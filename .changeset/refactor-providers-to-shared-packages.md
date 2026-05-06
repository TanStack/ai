---
'@tanstack/ai-openai': patch
'@tanstack/ai-grok': patch
'@tanstack/ai-groq': patch
'@tanstack/ai-openrouter': patch
'@tanstack/ai-ollama': patch
'@tanstack/ai-anthropic': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-fal': patch
'@tanstack/ai-elevenlabs': patch
---

Internal refactor: every provider now delegates `getApiKeyFromEnv` / `generateId` / `transformNullsToUndefined` / `ModelMeta` helpers to the new `@tanstack/ai-utils` package. `ai-openai`, `ai-grok`, and `ai-groq` additionally inherit OpenAI-compatible adapter base classes from the new `@tanstack/openai-base` package (Chat Completions / Responses text adapters, image / summarize / transcription / TTS / video adapters, schema converter, tool converters). The other providers (`ai-anthropic`, `ai-gemini`, `ai-ollama`, `ai-openrouter`, `ai-fal`, `ai-elevenlabs`) only consume `@tanstack/ai-utils` because they speak provider-native protocols, not OpenAI-compatible ones. No breaking changes — all public APIs remain identical.
