---
'@tanstack/ai-persistence': minor
'@tanstack/ai': minor
'@tanstack/ai-sandbox': minor
---

`RunStore.findActiveRun` is now **required**. It was optional and
feature-detected (`store.findActiveRun?.(threadId)`), which meant an adapter that
had not implemented it was indistinguishable from one reporting "nothing is
running": `reconstructChat` returned `activeRun: null`, and a client reloading
mid-generation silently never reconnected to the run still producing. That is a
production failure the type system was in a position to catch.

Adapters that already implement `findActiveRun` need no change. Adapters that do
not will now get a compile error; implement it as "most recent `'running'` run
for the thread, `null` if none" — in SQL,
`WHERE thread_id = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1`.
A backend that genuinely has no run lifecycle should declare
`ChatTranscriptStores` and omit `runs` entirely rather than stub the method.

The store-contract evolution policy changes to match: new store methods are
added as required, and capability tiers are expressed at the store level, not by
optional methods. The conformance testkit no longer skips its `findActiveRun`
assertions when the method is absent, and `findActiveRun` is no longer accepted
in `skipMethods`.

`RunStore` itself now lives in `@tanstack/ai`
(`isTerminalRunStatus` / `defineRunStore` / `InMemoryRunStore` travel with it and
are re-exported from `@tanstack/ai-persistence`), so the requirement applies
there too. `@tanstack/ai-sandbox`'s `fenceRunStore` forwards `findActiveRun`
unconditionally rather than materializing it only when the wrapped store has it;
`listByThread` and `listReclaimable` are still forwarded only when present.
