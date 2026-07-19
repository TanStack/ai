---
"@tanstack/ai": patch
---

Fix root `chat` span carrying only last iteration's usage (#916)

`otelMiddleware`'s `onFinish` stamps `FinishInfo.usage` onto the root
`chat` span, but the chat engine previously passed only the final
iteration's `RUN_FINISHED.usage` to that hook. `handleRunFinishedEvent`
overwrote `finishedEvent` each iteration, and `beginIteration()` reset
it to `null`, so any multi-iteration run (e.g. tool call → final
answer) under-reported the root span's `gen_ai.usage.input_tokens` /
`gen_ai.usage.output_tokens` — and any other middleware reading
`FinishInfo.usage` saw the same truncated total.

The fix introduces a separate `accumulatedUsage` field on `TextEngine`
that survives `beginIteration()`'s per-iteration reset, accumulates
every usage-bearing `RUN_FINISHED` chunk (the same summation `onUsage`
consumers already do), and is what `onFinish` receives. A new shared
helper `accumulateTokenUsage` sums core token counts plus every
optional numeric field (cost, cache/reasoning breakdowns, upstream cost
split, duration-based billing, units billed); provider-shaped
`providerUsageDetails` is preserved as latest-wins, matching how
`onUsage` consumers see the most recent per-iteration bag.

Per-iteration span attributes and the `gen_ai.client.token.usage`
histogram are unchanged — they still carry each iteration's
incremental values. The roll-up lives on the root span only, matching
the documented contract in `docs/advanced/otel.md`.
