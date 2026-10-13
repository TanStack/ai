---
'@tanstack/ai-groq': minor
---

Set reasoning with `chat({ reasoning })`.

- The adapter sends `reasoning_effort`. Qwen 3 turns thinking on or off: `high` sends `default`, and `off` sends `none`.
- Each chat model has its reasoning data in `model-meta.ts`. `GroqModelReasoningByName` and `GROQ_MODEL_REASONING` come from it.
- `reasoning_format` and `include_reasoning` stay in `modelOptions`. They pick the output format, not the effort.

Breaking: `reasoning_effort` is no longer in `modelOptions`.

```ts
// Before
chat({
  adapter: groqText('openai/gpt-oss-120b'),
  messages,
  modelOptions: { reasoning_effort: 'medium' },
})

// After
chat({
  adapter: groqText('openai/gpt-oss-120b'),
  messages,
  reasoning: 'medium',
})
```
