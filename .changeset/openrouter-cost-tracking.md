---
'@tanstack/ai-openrouter': minor
'@tanstack/ai': minor
---

Surface OpenRouter's per-request cost on `RUN_FINISHED.usage`.

OpenRouter reports the actual cost of each request inline on the chat response.
The `openRouterText` and `openRouterResponsesText` adapters now forward that
value on the terminal `RUN_FINISHED` event as `usage.cost`, with OpenRouter's
per-request breakdown under `usage.costDetails`. This is the cost OpenRouter
itself reports — it is not computed locally from token counts, so it accounts
for routing, fallback providers, BYOK, and cached-token pricing.

`@tanstack/ai` adds a shared `UsageTotals` type with optional `cost` and
`costDetails` fields. `RunFinishedEvent.usage`, the middleware `UsageInfo`
(`onUsage`), and `FinishInfo.usage` (`onFinish`) all use it, so cost can be read
without casts. The fields are optional and additive — adapters that do not
report cost are unaffected.
