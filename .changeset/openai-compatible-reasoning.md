---
'@tanstack/ai-openai': minor
'@tanstack/ai': minor
---

The OpenAI-compatible adapters support `chat({ reasoning })`. Add the levels of a model to its `createModel` definition (`reasoning: { levels, budget }`), or to the `reasoning` config of `openaiCompatibleText`. The adapter sends the level as `reasoning_effort` on Chat Completions, or as `reasoning: { effort, summary }` on Responses. `chat()` accepts only the levels of the model.

`OpenAICompatibleChatAdapter` and `OpenAICompatibleResponsesAdapter` take the same levels in a new `reasoning` constructor option, and in their last type parameter. TypeScript shows an error when the option is missing or its levels are different from the type parameter. The new `OpenAICompatibleAdapterOptions` type is exported from `@tanstack/ai-openai/compatible`.
