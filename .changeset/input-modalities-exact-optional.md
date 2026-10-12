---
'@tanstack/ai': patch
---

Text adapters pass `chat()`'s adapter constraint again when the project enables `exactOptionalPropertyTypes`. `TextAdapter.inputModalities` now accepts an explicit `undefined`, which the provider adapters' declarations emit for their per-model lookup.
