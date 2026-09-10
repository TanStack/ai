---
id: isRunStatus
title: isRunStatus
---

# Function: isRunStatus()

```ts
function isRunStatus(value): value is RunStatus;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:69](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L69)

Whether `value` is a [RunStatus](../type-aliases/RunStatus.md) — the guard a backend validates a row
with at DESERIALIZATION.

`RunStatus` is a compile-time claim about a storage column. A row arrives as
JSON out of D1, a Durable Object, or Postgres, and nothing in the type system
checked what that column actually held, so a `RunStore` implementation should
run its row's `status` through this before handing the record on. The readers
downstream act DESTRUCTIVELY on the answer — `@tanstack/ai-sandbox`'s journal
sweep DELETES the journal of a run it believes terminal — so a row that lies
about its status is not a display bug.

## Parameters

### value

`unknown`

## Returns

`value is RunStatus`
