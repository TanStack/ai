---
'@tanstack/openai-base': minor
'@tanstack/ai-openai': patch
---

The Chat Completions and Responses text adapters now support `wrapFetch`. When a call sets `wrapFetch`, the adapter sends its HTTP requests through the wrapper. The client of the adapter does not change for other calls. Every adapter that builds on `@tanstack/openai-base` gets this, for example OpenAI, Azure OpenAI, Grok, Groq, and the Bedrock Chat Completions and Responses APIs. The Bedrock Converse API does not use `@tanstack/openai-base`, so it ignores `wrapFetch`. Without `wrapFetch`, the requests do not change.
