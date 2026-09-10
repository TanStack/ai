---
id: InMemoryRunStore
title: InMemoryRunStore
---

# Class: InMemoryRunStore

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:338](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L338)

In-memory [RunStore](../interfaces/RunStore.md). Single process only.

## Implements

- [`RunStore`](../interfaces/RunStore.md)

## Constructors

### Constructor

```ts
new InMemoryRunStore(): InMemoryRunStore;
```

#### Returns

`InMemoryRunStore`

## Methods

### createOrResume()

```ts
createOrResume(input): Promise<RunRecord>;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:341](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L341)

Create a run record, or return the existing one unchanged if `runId` is
already present.

INVARIANT (idempotency): an existing record is returned **unchanged** and
the passed `threadId`/`startedAt`/`status` are ignored. This is what makes
resuming a run safe. `status` defaults to `'running'` on first creation.

#### Parameters

##### input

`Pick`\<[`RunRecord`](../interfaces/RunRecord.md), `"threadId"` \| `"runId"` \| `"startedAt"`\> & `object`

#### Returns

`Promise`\<[`RunRecord`](../interfaces/RunRecord.md)\>

#### Implementation of

[`RunStore`](../interfaces/RunStore.md).[`createOrResume`](../interfaces/RunStore.md#createorresume)

***

### findActiveRun()

```ts
findActiveRun(threadId): Promise<RunRecord | null>;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:404](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L404)

The most recent `'running'` run for `threadId`, or `null` if none is active.

REQUIRED. This resolves "does this thread have a live run to attach to?"
from the STABLE thread id, which is the durable basis for reconnecting a
client (a reload, or the same thread opened on another device) — independent
of the ephemeral run id, which a single turn may mint several of. When more
than one run is `'running'`, the one with the greatest `startedAt` wins.

A backend that stubs this to `null` turns reconnect off silently, because
`null` is also the correct answer for an idle thread. A backend with no run
lifecycle at all should omit the whole `runs` store instead — capability
tiers belong at the store level, not the method level.

#### Parameters

##### threadId

`string`

#### Returns

`Promise`\<[`RunRecord`](../interfaces/RunRecord.md) \| `null`\>

#### Implementation of

[`RunStore`](../interfaces/RunStore.md).[`findActiveRun`](../interfaces/RunStore.md#findactiverun)

***

### get()

```ts
get(runId): Promise<RunRecord | null>;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:379](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L379)

Current record, or null when unknown.

#### Parameters

##### runId

`string`

#### Returns

`Promise`\<[`RunRecord`](../interfaces/RunRecord.md) \| `null`\>

#### Implementation of

[`RunStore`](../interfaces/RunStore.md).[`get`](../interfaces/RunStore.md#get)

***

### listByThread()

```ts
listByThread(threadId): Promise<RunRecord[]>;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:383](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L383)

Every run in a conversation, ascending by `startedAt`. OPTIONAL: only
needed to render a thread's past agent activity. Consumers feature-detect.

#### Parameters

##### threadId

`string`

#### Returns

`Promise`\<[`RunRecord`](../interfaces/RunRecord.md)[]\>

#### Implementation of

[`RunStore`](../interfaces/RunStore.md).[`listByThread`](../interfaces/RunStore.md#listbythread)

***

### listReclaimable()

```ts
listReclaimable(opts): Promise<RunRecord[]>;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:390](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L390)

Runs that may be reclaimed: ALL THREE of `status === 'running'`,
`detachedSince` is set, and `detachedSince <= now - ttlMs`. The cutoff is
**inclusive** — a run detached at exactly `now - ttlMs` IS reclaimable.

OPTIONAL: only needed by a reaper. Consumers feature-detect.

`detachedSince` is populated by `withSandbox`'s detach path (see
[RunRecord.detachedSince](../interfaces/RunRecord.md#detachedsince)). The sweep over the candidates this
surfaces is `@tanstack/ai-sandbox`'s `reapDetachedRuns`: it finalizes a run
whose agent already finished, expires one past its TTL, and reclaims the
sandbox. That is a function, not a scheduler — the application invokes it
(cron, queue, `alarm()`, `waitUntil`) — and a backend that omits this
method cannot be reaped at all.

#### Parameters

##### opts

###### now

`number`

###### ttlMs

`number`

#### Returns

`Promise`\<[`RunRecord`](../interfaces/RunRecord.md)[]\>

#### Implementation of

[`RunStore`](../interfaces/RunStore.md).[`listReclaimable`](../interfaces/RunStore.md#listreclaimable)

***

### update()

```ts
update(runId, patch): Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:358](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L358)

Patch a record's mutable fields.

INVARIANT: updating an unknown `runId` is a **no-op** — it must not throw
and must not create a record.

#### Parameters

##### runId

`string`

##### patch

`Partial`\<`Pick`\<[`RunRecord`](../interfaces/RunRecord.md), 
  \| `"status"`
  \| `"finishedAt"`
  \| `"error"`
  \| `"usage"`
  \| `"sandboxKey"`
  \| `"detachedSince"`
  \| `"cancelRequested"`
  \| `"driverEpoch"`\>\>

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`RunStore`](../interfaces/RunStore.md).[`update`](../interfaces/RunStore.md#update)
