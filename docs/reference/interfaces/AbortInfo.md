---
id: AbortInfo
title: AbortInfo
---

# Interface: AbortInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:397](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L397)

Information passed to onAbort.

## Properties

### cancelRequested?

```ts
optional cancelRequested?: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:417](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L417)

True only when the abort came from an explicit, out-of-band cancel (e.g. a
cancel endpoint setting `RunRecord.cancelRequested`), never from a mere
client disconnect.

A disconnect and a user pressing "stop" are the SAME connection close on
the wire, so consumers must not infer intent from an abort alone. Middleware
that tears down expensive resources reads this to distinguish "the viewer
left, keep going" from "the user wants this stopped". Populated from the
abort reason: `true` exactly when the run was aborted with `RUN_CANCEL_REASON`
(matched with `===`, so an arbitrary error message can never be read as a
deliberate cancel), `false` for every other abort. The durable channel is
separate — middleware that must also catch a cancel recorded on a different
host reads `RunRecord.cancelRequested` in addition to this flag.

***

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:401](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L401)

Duration until abort in milliseconds

***

### reason?

```ts
optional reason?: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:399](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L399)

The reason for the abort, if provided
