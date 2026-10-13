---
'@tanstack/ai-opencode': minor
---

Set reasoning with `chat({ reasoning })`.

- The adapter writes the level into the model's `options` in the OpenCode server config.
- Claude models get `thinking` with a token budget. `off` disables thinking.
- Other models get `reasoningEffort`, and `reasoningSummary: 'auto'` when the summary is on.
- The reasoning data is in `model-meta.ts`, keyed by model id. `OpenCodeModelReasoningByName` and `OPENCODE_MODEL_REASONING` come from it.

Breaking: none. The adapter had no reasoning option before.

```ts
chat({ adapter: opencodeText('openai/gpt-5.2'), messages, reasoning: 'high' })
```
