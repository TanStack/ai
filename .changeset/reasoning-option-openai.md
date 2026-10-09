---
'@tanstack/ai-openai': minor
---

Set reasoning with `chat({ reasoning })` on `openaiText`, `openaiChatCompletions`, and `azureOpenaiText`.

- `openaiText` sends the level as `reasoning: { effort, summary }`.
- `openaiChatCompletions` sends `reasoning_effort`.
- `azureOpenaiText` and `createAzureOpenaiText` read the levels of the OpenAI model name, not of the deployment name, and send `reasoning: { effort, summary }`. A name that is not an OpenAI model takes no `reasoning`.
- Each chat model has its reasoning data in `model-meta.ts`. `OpenAIModelReasoningByName` and `OPENAI_MODEL_REASONING` come from it.

Breaking: `reasoning` is no longer in `modelOptions` of `openaiText`, `openaiChatCompletions`, `azureOpenaiText`, and `createAzureOpenaiText`. `OpenAIReasoningOptions` and `OpenAIReasoningOptionsWithConcise` are removed.

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
