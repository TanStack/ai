---
'@tanstack/ai-utils': minor
'@tanstack/openai-base': minor
'@tanstack/ai-openrouter': minor
'@tanstack/ai-groq': minor
---

Structured output sends `response_format: { type: "json_object" }` for OpenRouter and Groq models that declare a response format without strict structured outputs. These models reject strict `json_schema`. In JSON mode the adapter adds the schema as a system prompt. `await chat({ outputSchema })` checks the reply when the schema is a Standard Schema, such as Zod. Other models keep strict `json_schema`.

`modelOptions` can set `json_object` for any model. On the OpenAI-base adapters (OpenAI, Grok, Groq and others), a `json_object` in `modelOptions` was replaced by strict `json_schema`. It is now sent as given, with the schema in a system prompt. In JSON mode, `supportsCombinedToolsAndSchema()` returns `false`. Tools and the schema then go out in separate requests, so the tool-calling turns do not get the schema prompt.

OpenRouter catalog ids with a `:variant`, such as `google/gemma-4-26b-a4b-it:free`, now match their own catalog entry. Before, only the id without the variant was checked.
