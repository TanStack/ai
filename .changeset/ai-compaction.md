---
'@tanstack/ai-compaction': minor
---

Add `@tanstack/ai-compaction` — context-window compaction as a `chat()`
middleware. `withCompaction({ maxTokens })` keeps the recent tail verbatim and
replaces the older head with a single note (a summary when a `summarize`
callback is supplied, otherwise an eviction marker). It runs before every model
call via `onConfig`, so compaction is incremental and rolling, and it preserves
tool-call/result pairing so it never sends an orphaned tool result.
