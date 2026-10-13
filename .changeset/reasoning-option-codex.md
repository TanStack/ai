---
'@tanstack/ai-codex': minor
---

Set reasoning with `chat({ reasoning })`.

- The adapter sends the model's effort for the level as `model_reasoning_effort`.
- The `modelReasoningEffort` adapter config stays. It is the default for a call without `reasoning`.
- The reasoning data is in `model-meta.ts`, keyed by model id. `CodexModelReasoningByName` and `CODEX_MODEL_REASONING` come from it.

Breaking: `modelReasoningEffort` is no longer in `modelOptions`.

```ts
// Before
chat({
  adapter: codexText('gpt-5.1-codex'),
  messages,
  modelOptions: { modelReasoningEffort: 'high' },
})

// After
chat({ adapter: codexText('gpt-5.1-codex'), messages, reasoning: 'high' })
```
