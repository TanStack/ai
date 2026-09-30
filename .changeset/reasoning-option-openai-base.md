---
'@tanstack/openai-base': minor
---

The Chat Completions and Responses base adapters take a reasoning type parameter and a protected `modelReasoning(model)` hook. When a subclass returns the model's reasoning data, the base sends `chat({ reasoning })` as `reasoning_effort` (Chat Completions) or `reasoning: { effort, summary }` (Responses). The Chat Completions base also gets `includeUsageInStream` and `requestHeaders` hooks.
