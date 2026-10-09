---
'@tanstack/ai-bedrock': minor
---

Set reasoning with `chat({ reasoning })` on the three Bedrock APIs.

- Chat Completions sends `reasoning_effort`. Responses sends `reasoning.effort`.
- Converse sends thinking only for Claude: budget thinking in `additionalModelRequestFields` with the interleaved-thinking beta, and `maxTokens` grows past the budget. A model with effort levels gets adaptive thinking with `output_config.effort`. `off` sends nothing.
- The reasoning data is in `model-meta.ts`, keyed by catalog id. `BedrockModelReasoningByName` and `BEDROCK_MODEL_REASONING` come from it.

Breaking: `reasoning_effort` (Chat Completions) and `reasoning` (Responses) are no longer in `modelOptions`.

```ts
// Before
chat({
  adapter: bedrockText('openai.gpt-oss-120b-1:0', { api: 'chat' }),
  messages,
  modelOptions: { reasoning_effort: 'high' },
})

// After
chat({
  adapter: bedrockText('openai.gpt-oss-120b-1:0', { api: 'chat' }),
  messages,
  reasoning: 'high',
})
```
