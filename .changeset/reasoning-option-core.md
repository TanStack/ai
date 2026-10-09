---
'@tanstack/ai': minor
---

Add the `reasoning` option to `chat()`. Set how hard the model thinks in one way for every provider.

- Pass a level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. Or pass `{ level, summary?, budgetTokens? }`.
- The types allow only the levels of the selected model. `budgetTokens` is allowed only on a model that thinks with a token budget.
- At run time, a level that the model does not have moves to the nearest level that it has.
- Without `reasoning`, the provider default applies.
- A middleware can change the value in `onConfig`.

Breaking: none. Each adapter package removes its own reasoning fields from `modelOptions`. See the changeset of each adapter.

```ts
chat({ adapter: openaiText('gpt-5.5'), messages, reasoning: 'high' })
chat({
  adapter: anthropicText('claude-haiku-4-5'),
  messages,
  reasoning: { level: 'medium', budgetTokens: 4000 },
})
```

New exports: `REASONING_LEVELS`, `supportedReasoningLevels`, `clampReasoningLevel`, and the types `ReasoningLevel`, `ReasoningMap`, `ModelReasoning`, `ReasoningCapability`, `ReasoningOption`, `ReasoningOptionFor`, `ReasoningRequest`, and `AdapterReasoning`. `@tanstack/ai/adapter-internals` exports `resolveReasoning`, `reasoningValue`, `reasoningBudget`, `DEFAULT_REASONING_BUDGETS`, and the `ModelReasoningCapability` type for adapter authors. `TextAdapter` and `BaseTextAdapter` take a new last type parameter for the reasoning levels. Its default is `never`, so an adapter that does not set it takes no `reasoning`.
