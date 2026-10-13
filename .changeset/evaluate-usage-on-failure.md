---
'@tanstack/ai': patch
---

`decide()` now reports token usage when the provider answered but the answers cannot be mapped, for example when an answer is missing or has the wrong type. Before, `decide()` threw without reporting the usage that the provider already billed. The `onUsage` middleware hook and the `evaluate:usage` event now get that usage once, before `onError` runs. `onFinish` still does not run for a failed call, and `decide()` throws the original error.
