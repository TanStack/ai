---
'@tanstack/ai-openrouter': minor
---

Breaking: set reasoning with `chat({ reasoning })`. `modelOptions.reasoning` and the `ReasoningOptions` type are removed. `off` goes out as `effort: "none"`. The Responses adapter also takes `budgetTokens`.
