---
'@tanstack/ai-utils': minor
'@tanstack/openai-base': minor
'@tanstack/ai-openrouter': minor
'@tanstack/ai-groq': minor
---

Structured output sends `response_format: { type: "json_object" }` for OpenRouter and Groq models that declare a response format without strict structured outputs. These models reject strict `json_schema`. In JSON mode the adapter adds the schema as a system prompt, and the client still checks the reply with the schema. `modelOptions` can still set `json_object` for any model. Other models keep strict `json_schema`.
