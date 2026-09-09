---
'@tanstack/ai': minor
'@tanstack/ai-compaction': patch
---

Add a per-event `flush` option to `emitCustomEvent(name, value, { flush: true })` on both the middleware and tool-execution contexts.

A `CUSTOM` chunk normally batches in the durability layer, so a progress event emitted before the model produces output — a compaction/summarize pass in `beforeModel`, a sandbox boot, a retrieval step — stays buffered until the batch fills or a `RUN_FINISHED` / `TOOL_CALL_END` boundary fires, and ships bunched with later output instead of at emit time. (`RUN_STARTED` can't flush it either: the engine emits `RUN_STARTED` before the first pre-model custom event.) Marking a single event `{ flush: true }` flushes it on its own so a live progress indicator can render, without disabling batching for the rest of the stream — high-volume events like `process.stdout` keep batching.

`@tanstack/ai-compaction` now emits its `compaction:started` / `compaction:state` / `compaction:ended` lifecycle events with `{ flush: true }`, so a "condensing…" indicator renders while the summarize is still running instead of appearing bunched after it finishes.
