---
id: RunRecord
title: RunRecord
---

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:106](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L106)

Durable bookkeeping for a single run.

## Properties

### cancelRequested?

```ts
optional cancelRequested?: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:168](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L168)

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

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:158](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L158)

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

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:178](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L178)

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

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:137](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L137)

***

### finishedAt?

```ts
optional finishedAt?: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:136](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L136)

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:133](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L133)

Agent name (`researcher`, `writer`) when this record is a subagent.

***

### parentRunId?

```ts
optional parentRunId?: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:125](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L125)

Parent chat run that started this child, when this record is a subagent.
Absent on the parent run itself.

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

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:148](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L148)

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

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:135](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L135)

***

### status

```ts
status: RunStatus;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:134](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L134)

***

### subagentRunId?

```ts
optional subagentRunId?: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:131](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L131)

The child's AG-UI subagentRunId, the id on its `SUBAGENT_*` chunks and on
every chunk it streams. On a child record this equals `runId`. Absent on
the parent run.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:120](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L120)

Conversation this run belongs to — the `Scope.threadId`.

Generation jobs (a one-shot `generate()` with no conversation) must not
reuse this record by faking `threadId = requestId`; they need a separate
job store. `withGenerationPersistence` currently does exactly that and
labels itself a stopgap — do not copy it.

A subagent child record stores `subagent:<subagentRunId>` here, the key of
its own transcript, so `findActiveRun` and `listByThread` on the
conversation never return children. Use `listByParentRun`.

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:138](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L138)
