---
'@tanstack/ai': patch
---

Stream durable responses live again. With `durability` set, a chunk waited in the append batch until 32 chunks arrived or the run finished, so a short reply showed up all at once at the end. Now the batch also flushes when the model sends no new chunk for 50ms. You do not need `batch: 1` for live text any more. `batch` stays the largest number of chunks in one append.

Set the wait with the new `batchWaitMs` option on `durability` (`toServerSentEventsResponse`, `toHttpResponse`) and on `toWebSocketStream` / `toWebSocketResponse`. A higher value means fewer writes to the log but slower live text. `0` appends every chunk on its own.
