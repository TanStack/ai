---
id: RunStore
title: RunStore
---

# Interface: RunStore

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:179](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L179)

Durable store for run lifecycle records.

REQUIRED: `createOrResume`, `update`, `get`, `findActiveRun`. Every backend
must implement all four — they are what the persistence middleware calls
unconditionally. `findActiveRun` is required rather than feature-detected
because a backend that has not implemented it is indistinguishable from one
whose answer is legitimately `null`, so reconnect would silently do nothing
instead of failing at build time. It was optional for exactly one release
cycle and cost precisely that.

OPTIONAL: `listByThread`, `listReclaimable`. Each serves one higher-level
feature (thread history, reclaim reaping) and callers feature-detect them,
degrading gracefully when a backend omits them.

## Properties

### createOrResume

```ts
createOrResume: (input) => Promise<RunRecord>;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:188](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L188)

Create a run record, or return the existing one unchanged if `runId` is
already present.

INVARIANT (idempotency): an existing record is returned **unchanged** and
the passed `threadId`/`startedAt`/`status` are ignored. This is what makes
resuming a run safe. `status` defaults to `'running'` on first creation.

#### Parameters

##### input

`Pick`\<[`RunRecord`](RunRecord.md), `"threadId"` \| `"runId"` \| `"startedAt"`\> & `object`

#### Returns

`Promise`\<[`RunRecord`](RunRecord.md)\>

***

### findActiveRun

```ts
findActiveRun: (threadId) => Promise<RunRecord | null>;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:255](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L255)

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

`Promise`\<[`RunRecord`](RunRecord.md) \| `null`\>

***

### get

```ts
get: (runId) => Promise<RunRecord | null>;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:216](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L216)

Current record, or null when unknown.

#### Parameters

##### runId

`string`

#### Returns

`Promise`\<[`RunRecord`](RunRecord.md) \| `null`\>

***

### listByThread?

```ts
optional listByThread?: (threadId) => Promise<RunRecord[]>;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:221](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L221)

Every run in a conversation, ascending by `startedAt`. OPTIONAL: only
needed to render a thread's past agent activity. Consumers feature-detect.

#### Parameters

##### threadId

`string`

#### Returns

`Promise`\<[`RunRecord`](RunRecord.md)[]\>

***

### listReclaimable?

```ts
optional listReclaimable?: (opts) => Promise<RunRecord[]>;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:237](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L237)

Runs that may be reclaimed: ALL THREE of `status === 'running'`,
`detachedSince` is set, and `detachedSince <= now - ttlMs`. The cutoff is
**inclusive** — a run detached at exactly `now - ttlMs` IS reclaimable.

OPTIONAL: only needed by a reaper. Consumers feature-detect.

`detachedSince` is populated by `withSandbox`'s detach path (see
[RunRecord.detachedSince](RunRecord.md#detachedsince)). The sweep over the candidates this
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

`Promise`\<[`RunRecord`](RunRecord.md)[]\>

***

### update

```ts
update: (runId, patch) => Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:199](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L199)

Patch a record's mutable fields.

INVARIANT: updating an unknown `runId` is a **no-op** — it must not throw
and must not create a record.

#### Parameters

##### runId

`string`

##### patch

`Partial`\<`Pick`\<[`RunRecord`](RunRecord.md), 
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
