---
'@tanstack/ai-openrouter': minor
'@tanstack/ai': minor
---

- Add OpenRouter cost tracking. The `OpenRouterTextAdapter` now attaches the authoritative per-request USD cost to the `RUN_FINISHED` event under `usage.cost`, along with `usage.costDetails.upstreamInferenceCost` and `usage.costDetails.cacheDiscount` when present. Cost is sourced from OpenRouter's chat completion response itself (the field arrives in the trailing SSE chunk), so there is no extra HTTP request and no added end-of-stream latency.
- Cost is always sourced from OpenRouter — never computed locally from token counts and a price table — because OpenRouter routes the same model id to different upstream providers (primary, fallback, BYOK) with different pricing, and applies cache discounts the SDK cannot reconstruct.
- Cost is captured via the SDK's public `HTTPClient` response hook. The hook calls `Response.clone()` and parses the cloned body out-of-band to recover `usage.cost` and `usage.cost_details`, which the @openrouter/sdk Zod parser would otherwise strip (the schema doesn't declare those fields). The SDK's stream consumer is unaffected — both clones are read independently.
- Custom `httpClient` values passed into the adapter are preserved: the adapter clones the caller's client (inheriting their fetcher, retries, tracing, and any pre-registered hooks) and appends the cost-capture hook to the clone, so the caller's original instance is never mutated and cost tracking still works when callers supply their own transport.
- Defer the OpenRouter `RUN_FINISHED` emission until after the upstream stream fully drains, so token usage that arrives in a trailing usage-only chunk (the common case for OpenAI-compatible providers, where the final chunk has empty `choices`) is included in `usage` instead of being dropped.
- Extend `RunFinishedEvent.usage` in `@tanstack/ai` with optional `cost` and `costDetails` fields. The middleware `UsageInfo` (consumed by `onUsage`) and `FinishInfo.usage` (consumed by `onFinish`) carry the same fields, so middleware authors can read cost without casts. The change is additive and backwards-compatible for adapters that don't populate cost.
