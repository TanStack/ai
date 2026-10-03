---
'@tanstack/ai': minor
---

`keyedAdapter(provider, create)` wraps an adapter factory that needs a provider key, and `isKeyedAdapter` tells it apart from a plain adapter. Agents get `ctx.keys` (`get`, `require`, and `adapter`) from the new `SubagentBinding.keys`, or else from each provider's `env` names.
