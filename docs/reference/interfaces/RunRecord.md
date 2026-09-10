---
id: RunRecord
title: RunRecord
---

# Interface: RunRecord

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:106](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L106)

Durable bookkeeping for a single run.

## Properties

### cancelRequested?

```ts
optional cancelRequested?: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:151](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L151)

Set by an explicit out-of-band cancel, to be distinguished from a mere
client disconnect (the two produce an identical TCP close, so intent is not
inferable from the disconnect).

Written by `requestRunCancel` and read by `wasCancelRequested` (both in
`../cancel`). Deliberately NOT a status: recording intent is not the same as
the run having stopped, and only the driver knows when it has.

***

### detachedSince?

```ts
optional detachedSince?: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:141](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L141)

Epoch ms when the last viewer detached; absent while someone is attached.
Written by `withSandbox`'s detach path (`onAbort` in `@tanstack/ai-sandbox`'s
`middleware.ts`) alongside `sandboxKey`, when a disconnect leaves the
agent running rather than tearing the sandbox down. A backend must
round-trip this field: `listReclaimable` depends on it, and
`@tanstack/ai-sandbox`'s `reapDetachedRuns` sweeps the candidates it
surfaces (see that method's doc comment).

***

### driverEpoch?

```ts
optional driverEpoch?: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:161](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L161)

Monotonic fencing token for the run's driver. Bumped by each host that
successfully claims the run (see `withRunClaim` in `@tanstack/ai-sandbox`),
so a superseded host can discover it lost by comparing the stored value
against the one it holds.

A lock alone cannot provide this: it tells the winner it won, but gives a
loser nothing to read. Absent on a run that was never claimed.

***

### error?

```ts
optional error?: RunError;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:120](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L120)

***

### finishedAt?

```ts
optional finishedAt?: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:119](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L119)

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:107](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L107)

***

### sandboxKey?

```ts
optional sandboxKey?: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:131](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L131)

Compound sandbox key this run was bound to, when it ran in a sandbox.
Recorded so a future reclaimer can identify the sandbox to tear down
without re-deriving the key. Written by `withSandbox`'s detach path
(`onAbort` in `@tanstack/ai-sandbox`'s `middleware.ts`) at the same time as
`detachedSince`, when a disconnect leaves the run detached rather than
destroying the sandbox. A backend must round-trip this field — see
`listReclaimable` below for who eventually reads it.

***

### startedAt

```ts
startedAt: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:118](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L118)

***

### status

```ts
status: RunStatus;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:117](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L117)

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:116](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L116)

Conversation this run belongs to — the `Scope.threadId`.

Generation jobs (a one-shot `generate()` with no conversation) must not
reuse this record by faking `threadId = requestId`; they need a separate
job store. `withGenerationPersistence` currently does exactly that and
labels itself a stopgap — do not copy it.

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:121](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L121)
