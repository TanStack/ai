---
'@tanstack/ai-openai': minor
---

`OpenAICompatibleChatAdapter` and `OpenAICompatibleResponsesAdapter` support `chat({ reasoning })`. Pass the levels of the model in the new `reasoning` constructor option, and pass the same levels as the last type parameter. The adapter sends the level as `reasoning_effort` on Chat Completions, or as `reasoning: { effort, summary }` on Responses. The new `OpenAICompatibleAdapterOptions` type is exported from `@tanstack/ai-openai/compatible`.
