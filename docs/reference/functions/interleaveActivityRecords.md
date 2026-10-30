---
id: interleaveActivityRecords
title: interleaveActivityRecords
---

```ts
function interleaveActivityRecords(modelUI, records): UIMessage<unknown>[];
```

Defined in: [packages/ai/src/activities/chat/activity-records.ts:46](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/activity-records.ts#L46)

Insert activity rows into a model-derived UI transcript at each record's
stored `index`. Earlier records are inserted first so later indexes stay
aligned with the growing list.

## Parameters

### modelUI

[`UIMessage`](../interfaces/UIMessage.md)\<`unknown`\>[]

### records

[`ActivityRecord`](../interfaces/ActivityRecord.md)[]

## Returns

[`UIMessage`](../interfaces/UIMessage.md)\<`unknown`\>[]
