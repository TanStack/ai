---
'@tanstack/ai-claude-code': minor
---

Set reasoning with `chat({ reasoning })`.

- A model with effort levels gets `--effort <level>`.
- A budget model (Haiku) gets `MAX_THINKING_TOKENS` with the budget, or `0` for `off`.
- The reasoning data is in `model-meta.ts`, keyed by model id. `ClaudeCodeModelReasoningByName` and `CLAUDE_CODE_MODEL_REASONING` come from it.

Breaking: none. The adapter had no reasoning option before.

```ts
chat({
  adapter: claudeCodeText('claude-opus-4-8'),
  messages,
  reasoning: 'xhigh',
})
```
