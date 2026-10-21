---
id: LogRecordsWriter
title: LogRecordsWriter
---

Defined in: packages/ai/src/activities/chat/middleware/log-records.ts:16

Appends records to the session log that a host keeps. A host is a
middleware that provides this capability. `chat()` does not provide it.

## Properties

### append

```ts
append: (records) => Promise<void>;
```

Defined in: packages/ai/src/activities/chat/middleware/log-records.ts:22

Resolves when the host has written all the records. Rejects when the
host refuses a record or the write fails. Then the host writes none of
the records. The host decides which record types it accepts.

#### Parameters

##### records

readonly [`LogRecord`](LogRecord.md)[]

#### Returns

`Promise`\<`void`\>
