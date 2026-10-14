---
'@tanstack/ai': patch
---

`decide()` now reports token usage when the provider answered but the answers cannot be mapped, for example when an answer is missing, has the wrong type, or has no probability for its value. Before, `decide()` threw without reporting the usage that the provider already billed. The `onUsage` middleware hook and the `evaluate:usage` event now get that usage once, before `onError` runs. `onFinish` still does not run for a failed call, and `decide()` throws the mapping error. If an `onUsage` hook throws, that error is thrown instead, as it is for a successful call. The mapping error is still logged.
