---
'@tanstack/ai-mistral': minor
---

Set reasoning with `chat({ reasoning })`.

- Mistral Small and Mistral Medium get `reasoning_effort`, and `none` for `off`.
- Magistral gets `prompt_mode: 'reasoning'`. `off` sends nothing.
- Each chat model has its reasoning data in `model-meta.ts`. `MistralModelReasoningByName` and `MISTRAL_MODEL_REASONING` come from it.

Breaking: none. The adapter had no reasoning option before.

```ts
chat({
  adapter: mistralText('mistral-small-latest'),
  messages,
  reasoning: 'high',
})
```
