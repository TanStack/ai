---
'@tanstack/ai': minor
'@tanstack/openai-base': minor
'@tanstack/ai-openrouter': minor
'@tanstack/ai-groq': minor
---

Add `structuredOutputMode` on `chat()` so structured output can send `response_format: { type: "json_object" }` when a model rejects strict `json_schema`. `auto` selects JSON mode for OpenRouter and Groq models that declare response format without structured outputs. The default stays strict `json_schema`.
