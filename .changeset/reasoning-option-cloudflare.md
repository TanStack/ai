---
'@tanstack/ai-cloudflare': minor
---

Set reasoning with `chat({ reasoning })`.

- The adapter sends `reasoning_effort`, and `null` for `off`.
- The reasoning data is in `utils/models.ts`, keyed by model id. `CloudflareModelReasoningByName` and `CLOUDFLARE_MODEL_REASONING` come from it.
- `chat_template_kwargs` stays in `modelOptions`. It picks the output format, not the effort.

Breaking: `reasoning_effort` is no longer in `modelOptions`.

```ts
// Before
chat({
  adapter: cloudflareText('@cf/zai-org/glm-5.3'),
  messages,
  modelOptions: { reasoning_effort: 'low' },
})

// After
chat({
  adapter: cloudflareText('@cf/zai-org/glm-5.3'),
  messages,
  reasoning: 'low',
})
```
