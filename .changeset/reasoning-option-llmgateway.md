---
'@tanstack/ai-llmgateway': minor
---

Set reasoning with `chat({ reasoning })`.

- The adapter sends `reasoning_effort`. Its types take no `budgetTokens`.
- Each chat model has its reasoning data in `model-meta.ts`. `LLMGatewayModelReasoningByName` and `LLMGATEWAY_MODEL_REASONING` come from it.

Breaking: `reasoning_effort` is no longer in `modelOptions`.

```ts
// Before
chat({
  adapter: llmGatewayText('kimi-k3'),
  messages,
  modelOptions: { reasoning_effort: 'high' },
})

// After
chat({ adapter: llmGatewayText('kimi-k3'), messages, reasoning: 'high' })
```
