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
`costDetails` fields, plus a provider-neutral `UsageCostBreakdown` interface
with three canonical fields (`upstreamCost`, `upstreamInputCost`,
`upstreamOutputCost`). Each adapter's extractor normalizes its provider's
wire-shape onto this canonical form, so consumer code reads the same fields
regardless of which gateway populated them — swapping adapters is a one-line
change with no consumer rewrites. The OpenRouter adapter collapses its two
endpoint naming styles (Chat Completions' `prompt`/`completions` and
Responses' `input`/`output`) onto the same canonical input/output split, since
they bill against the same tokens. `RunFinishedEvent.usage`, the middleware
`UsageInfo` (`onUsage`), and `FinishInfo.usage` (`onFinish`) all use
`UsageTotals`. The fields are optional and additive — adapters that do not
report cost are unaffected.
