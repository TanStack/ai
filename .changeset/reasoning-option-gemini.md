---
'@tanstack/ai-gemini': minor
---

Set thinking with `chat({ reasoning })`.

- Gemini 3 models get `thinkingLevel`.
- Gemini 2.5 models get `thinkingBudget`, from `budgetTokens` or a per-model table. `off` sends `thinkingBudget: 0`.
- `summary` sets `includeThoughts`.
- The experimental Interactions adapter sends `thinking_level` and `thinking_summaries`.
- Each chat model has its reasoning data in `model-meta.ts`. `GeminiModelReasoningByName` and `GEMINI_MODEL_REASONING` come from it.

Breaking: `thinkingConfig` is no longer in the chat `modelOptions`, and `GeminiThinkingOptions` is removed. The Interactions adapter no longer takes `generation_config.thinking_level` or `thinking_summaries`. Image generation keeps its own `thinkingConfig`.

```ts
// Before
chat({
  adapter: geminiText('gemini-3.5-flash'),
  messages,
  modelOptions: {
    thinkingConfig: { includeThoughts: true, thinkingLevel: 'HIGH' },
  },
})

// After
chat({ adapter: geminiText('gemini-3.5-flash'), messages, reasoning: 'high' })
```
