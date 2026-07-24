---
'@tanstack/ai-client': minor
---

Tail an in-flight run on a fresh client via `initialResumeSnapshot`.

A `ChatClient`'s resume pointer is per-browser, so a fresh client — the same
thread opened on a second device or another browser — had no pointer and would
stop at the hydrated snapshot even while the run was still generating. The
existing `initialResumeSnapshot` option only restored interrupts; now a snapshot
carrying a _bare in-flight run_ (a `resumeState.runId` with no pending
interrupts) is rejoined too, exactly like a persisted pointer. A server-
authoritative app can report the thread's active run id during hydration and
hand it over as `initialResumeSnapshot` so the new client live-tails the run to
completion. A client that started the run still rejoins via its own persisted
pointer; a run named by the persisted store wins over the passed snapshot.
