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

Internal refactor: delegate shared utilities to `@tanstack/ai-utils` and OpenAI-compatible adapter logic to `@tanstack/openai-base`. No breaking changes — all public APIs remain identical.
