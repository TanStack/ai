---
'@tanstack/ai-openai': minor
---

`OpenAICompatibleChatAdapter` and `OpenAICompatibleResponsesAdapter` support `chat({ reasoning })`. Pass the levels of the model in the new `reasoning` constructor option, and pass the same levels as the last type parameter. TypeScript shows an error when the option is missing or its levels are different from the type parameter. The adapter sends the level as `reasoning_effort` on Chat Completions, or as `reasoning: { effort, summary }` on Responses. The new `OpenAICompatibleAdapterOptions` type is exported from `@tanstack/ai-openai/compatible`.
