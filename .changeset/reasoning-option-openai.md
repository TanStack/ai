---
'@tanstack/ai-openai': minor
---

Set reasoning with `chat({ reasoning })` on `openaiText` and `openaiChatCompletions`.

- `openaiText` sends the level as `reasoning: { effort, summary }`.
- `openaiChatCompletions` sends `reasoning_effort`.
- Each chat model has its reasoning data in `model-meta.ts`. `OpenAIModelReasoningByName` and `OPENAI_MODEL_REASONING` come from it.

Breaking: `reasoning` is no longer in `modelOptions` of `openaiText` and `openaiChatCompletions`. `OpenAIReasoningOptions` and `OpenAIReasoningOptionsWithConcise` are removed. `azureOpenaiText` keeps `modelOptions.reasoning`, because a deployment name is not a model id.

```ts
// Before
chat({
  adapter: openaiText('gpt-5.5'),
  messages,
  modelOptions: { reasoning: { effort: 'high', summary: 'auto' } },
})

// After
chat({ adapter: openaiText('gpt-5.5'), messages, reasoning: 'high' })
```
