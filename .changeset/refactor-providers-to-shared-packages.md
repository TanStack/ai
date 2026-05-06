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

Internal refactor: every provider now delegates `getApiKeyFromEnv` / `generateId` / `transformNullsToUndefined` / `ModelMeta` helpers to the new `@tanstack/ai-utils` package. `ai-openai` and `ai-grok` additionally inherit OpenAI-compatible adapter base classes (Chat Completions / Responses text, image, summarize, transcription, TTS, video) from the new `@tanstack/openai-base` package; `ai-groq` keeps its own `BaseTextAdapter`-derived text adapter (Groq uses the `groq-sdk`, not the OpenAI SDK) but consumes `@tanstack/openai-base`'s schema converter and tool converters. The remaining providers (`ai-anthropic`, `ai-gemini`, `ai-ollama`, `ai-openrouter`, `ai-fal`, `ai-elevenlabs`) only consume `@tanstack/ai-utils` because they speak provider-native protocols, not OpenAI-compatible ones. No breaking changes — all public APIs remain identical.
