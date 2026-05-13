---
'@tanstack/ai': patch
---

Tighten the `TProviderOptions` generic constraint across the summarize surface from `extends object` to `extends Record<string, unknown>`, and align the default from `Record<string, any>` to `Record<string, unknown>`. Affects `SummarizationOptions`, `SummarizeAdapter`, `BaseSummarizeAdapter`, and `ChatStreamSummarizeAdapter`. Removes the `any`/`unknown`/`object` mixed defaults that previously lived inside the summarize folder and forces unparameterised callers to narrow before indexed access. No public-surface signature change for callers that supply a concrete provider-options shape (every shipping adapter does).
