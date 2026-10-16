---
'@tanstack/ai-harness': patch
---

A host that finds a live run lease of another host on a thread treats the thread as owned elsewhere, also when that host's work claim lapsed. Before, a claim whose writes stalled (a store that retries) expired while its turn still ran, and another host ran the queued inputs in the middle of that turn: a user message landed between a tool call and its result.
