---
'@tanstack/ai-groq': minor
---

feat: add groqSummarize and createGroqSummarize adapters

Groq now exposes tree-shakeable summarize factories that wrap `GroqTextAdapter`
in `ChatStreamSummarizeAdapter`, matching the pattern used by OpenAI, Anthropic,
Gemini, Ollama, Grok, and OpenRouter.
