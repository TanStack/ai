---
'@tanstack/ai': minor
---

Add `LogRecordsCapability`. A chat middleware can append records to the durable session log of its run, when a host provides that log. Read the writer with `getLogRecords(ctx)`. A host provides it with `provideLogRecords(ctx, writer)`.
