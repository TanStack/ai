---
'@tanstack/ai': minor
---

Add `LogRecordsCapability` and the `LogRecord` and `LogRecordsWriter` types. A chat middleware can append records to a session log when a host middleware provides one. Read the writer with `getLogRecords(ctx, { optional: true })`. It is `undefined` when no host provides the log, and `getLogRecords(ctx)` throws. A host provides the writer in `setup` with `provideLogRecords(ctx, writer)`. `@tanstack/ai` does not provide the log.
