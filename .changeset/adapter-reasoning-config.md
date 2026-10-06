---
'@tanstack/ai': minor
'@tanstack/ai-anthropic': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-gemini': minor
'@tanstack/ai-bedrock': minor
'@tanstack/ai-mistral': minor
'@tanstack/ai-cloudflare': minor
'@tanstack/ai-models': minor
---

Give an adapter the model's reasoning data in its config. A model id that is not in the adapter's own list (a gateway id, a new model, or a catalog id) got no reasoning field before. Now `reasoning?: ModelReasoning` in the config wins over the adapter's table, for the request fields and for the levels that `chat({ reasoning })` takes. `false` sends no reasoning field. Without it, nothing changes.

The factories take any model id string: `anthropicText`, `createAnthropicChat`, `anthropicVertexText`, `openaiText`, `createOpenaiChat`, `azureOpenaiText`, `geminiText`, `createGeminiChat`, `createBedrockConverse`, `mistralText`, `createMistralText`, `cloudflareText`, and `createCloudflareText`. A misspelled id is no longer a type error.

`@tanstack/ai-models` adds `modelReasoning(record)`, which turns a catalog record into the config value:

```ts
createAnthropicChat(record.id, apiKey, { reasoning: modelReasoning(record) })
```
