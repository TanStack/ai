---
'@tanstack/ai-harness': minor
---

A harness session keeps usage totals for its thread.

- `session.usage()` and `snapshot().usage` return `{ total, byModel, bySender }`. Each entry has `calls`, the token counts, and `cost` when a provider reported one.
- Every model call counts: the turn's own calls, its subagents, and background agents, for the sender of the turn or the person who started the agent.
- A durable host keeps a `harness.usage` record per call in the log. Other hosts keep the totals in `stores.metadata`, or in memory without one.
- A `harness.usage` event fires on each call, so a UI can show a live total.
