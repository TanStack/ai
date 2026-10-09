---
'@tanstack/ai-anthropic': minor
---

Set thinking with `chat({ reasoning })`.

- `off` sends `thinking: { type: 'disabled' }`.
- A budget model, or a request with `budgetTokens`, gets `thinking: { type: 'enabled', budget_tokens }`. Without `budgetTokens`, the level picks the budget. `max_tokens` grows past the budget.
- Claude 4.6 gets adaptive thinking with the top-level `effort`. Claude 4.7 and later get adaptive thinking with `output_config.effort`.
- `summary: false` sends `display: 'omitted'`.
- Each model has its reasoning data in `model-meta.ts`. `AnthropicModelReasoningByName` and `ANTHROPIC_MODEL_REASONING` come from it.

Breaking: `thinking`, `effort`, and `output_config.effort` are no longer in `modelOptions`. `AnthropicThinkingOptions`, `AnthropicAdaptiveThinkingOptions`, `AnthropicAdaptiveOnlyThinkingOptions`, `AnthropicAdaptiveOrDisabledThinkingOptions`, `AnthropicEffortOptions`, and `AnthropicOutputConfigOptions` are removed.

```ts
// Before
chat({
  adapter: anthropicText('claude-sonnet-5'),
  messages,
  modelOptions: {
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: { effort: 'xhigh' },
  },
})

// After
chat({
  adapter: anthropicText('claude-sonnet-5'),
  messages,
  reasoning: 'xhigh',
})
```
