---
'@tanstack/ai-lovable': minor
---

Set reasoning with `chat({ reasoning })` on both Lovable adapters.

- The chat adapter sends `reasoning_effort`. The Responses adapter sends `reasoning.effort`. Their types take no `budgetTokens`.
- Each chat model has its reasoning data in `model-meta.ts`. `LovableModelReasoningByName` and `LOVABLE_MODEL_REASONING` come from it.

Breaking: `reasoning` and `include_reasoning` are no longer in `modelOptions`.

```ts
// Before
chat({
  adapter: lovableText('openai/gpt-5.5'),
  messages,
  modelOptions: { reasoning: { effort: 'high' } },
})

// After
chat({ adapter: lovableText('openai/gpt-5.5'), messages, reasoning: 'high' })
```
