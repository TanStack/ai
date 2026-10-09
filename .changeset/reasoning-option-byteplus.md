---
'@tanstack/ai-byteplus': minor
---

Set thinking with `chat({ reasoning })`.

- The adapter sends `thinking.type`, plus `reasoning_effort` when the level has an effort value.
- `off` sends only `thinking: { type: 'disabled' }`, because Ark refuses an effort next to it.
- Each chat model has its reasoning data in `model-meta.ts`. `BytePlusModelReasoningByName` and `BYTEPLUS_MODEL_REASONING` come from it.

Breaking: `thinking` and `reasoning_effort` are no longer in `modelOptions`. `BytePlusThinkingOption` and `BytePlusReasoningEffort` are removed.

```ts
// Before
chat({
  adapter: byteplusText('glm-5-2-260617'),
  messages,
  modelOptions: { thinking: { type: 'disabled' } },
})

// After
chat({ adapter: byteplusText('glm-5-2-260617'), messages, reasoning: 'off' })
```
