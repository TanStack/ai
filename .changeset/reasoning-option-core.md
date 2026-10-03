---
'@tanstack/ai': minor
---

Add `reasoning` to `chat()`: a level (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`) or `{ level, summary, budgetTokens }`. An adapter declares each model's levels, so the option is typed per model, and `budgetTokens` only goes to models that think with a token budget. Leaving it out keeps the provider default. Middleware can change it in `onConfig`.

New exports: `REASONING_LEVELS`, `supportedReasoningLevels`, `clampReasoningLevel`, and the types `ReasoningLevel`, `ReasoningMap`, `ModelReasoning`, `ReasoningCapability`, `ReasoningOption`, `ReasoningOptionFor`, `ReasoningRequest`, and `AdapterReasoning`. Adapter authors get `resolveReasoning`, `reasoningValue`, `reasoningBudget`, and `DEFAULT_REASONING_BUDGETS` from `@tanstack/ai/adapter-internals`. `BaseTextAdapter` and `TextAdapter` take a new last type parameter for the reasoning levels.
