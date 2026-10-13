---
'@tanstack/ai-openrouter': minor
---

Set reasoning with `chat({ reasoning })` on both OpenRouter adapters.

- The chat adapter sends `reasoning.effort`, and `none` for `off`. Its request has no budget field, so its types take no `budgetTokens`.
- The Responses adapter sends `reasoning.effort`, `summary: 'auto'` when the summary is on, and `maxTokens` for `budgetTokens`.
- Each model has its reasoning data in `model-meta.ts`. `OpenRouterModelReasoningByName` and `OPENROUTER_MODEL_REASONING` come from it.

Breaking: `reasoning` is no longer in `modelOptions`, and `ReasoningOptions` is removed.

```ts
// Before
chat({
  adapter: openRouterText('openai/gpt-5.5'),
  messages,
  modelOptions: { reasoning: { enabled: false } },
})

// After
chat({ adapter: openRouterText('openai/gpt-5.5'), messages, reasoning: 'off' })
```
