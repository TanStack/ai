---
'@tanstack/ai-vercel-gateway': minor
---

Set reasoning with `chat({ reasoning })`.

- The chat adapter sends the AI Gateway `reasoning` object: `{ effort }`, `{ enabled: false }` for `off`, or `{ enabled: true, max_tokens }` for `budgetTokens`. `exclude: true` hides the thinking text when the summary is off.
- The Responses adapter sends `reasoning.effort`. Its types take no `budgetTokens`.
- Each chat model has its reasoning data in `model-meta.ts`. `VercelGatewayModelReasoningByName` and `VERCEL_GATEWAY_MODEL_REASONING` come from it.

Breaking: `reasoning` and `include_reasoning` are no longer in `modelOptions`.

```ts
// Before
chat({
  adapter: vercelGatewayText('openai/gpt-5.5'),
  messages,
  modelOptions: { reasoning: { effort: 'high' } },
})

// After
chat({
  adapter: vercelGatewayText('openai/gpt-5.5'),
  messages,
  reasoning: 'high',
})
```
