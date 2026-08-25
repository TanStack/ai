---
'@tanstack/ai-persistence': minor
---

`withPersistence` now stamps a stable `id` on every message it saves. The chat
engine already ids assistant messages; the middleware fills one in for incoming
user messages, engine-created tool messages, and compaction-injected messages
that would otherwise be saved without one. It mutates the shared message objects,
so the same message keeps its id across a run's saves and, when the server owns
the thread, across the next turn's reload. This lets a row-keyed store reconcile
by id (`SELECT id, version` then delete/insert/update) instead of rewriting the
whole transcript. See "Storing messages per row" in the store reference.
