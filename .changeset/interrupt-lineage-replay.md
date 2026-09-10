---
'@tanstack/ai-client': patch
---

Fix a resolved interrupt coming back as pending when a fresh `ChatClient` replays a thread's saved event history. `ChatClient.observeInterruptState` hydrated any `RUN_FINISHED` event with an interrupt outcome without checking run lineage, so a stale pause from an already-answered run (proven answered by a later run whose `parentRunId` points back to it) could resurface as a live approval card that never cleared. The client now tracks `parentRunId` from `RUN_STARTED` events and clears (or refuses to re-hydrate) an interrupt once a lineage descendant of its run has finished, idempotently across a repeated or reconnecting replay.
