---
id: wasCancelRequested
title: wasCancelRequested
---

# Function: wasCancelRequested()

```ts
function wasCancelRequested(runs, runId): Promise<boolean>;
```

Defined in: [packages/ai/src/activities/chat/cancel.ts:71](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/cancel.ts#L71)

Whether an explicit cancel has been recorded for `runId`.

Answers `false` rather than throwing when the store cannot be read. Callers
are middleware abort hooks, which are already on a teardown path, and a
store failure there must not replace the caller's own reason for tearing
down with a store error. The cost of a false negative is that a cancel
degrades into a detach — the run record gains `detachedSince`/`sandboxKey`
instead of transitioning to `'aborted'`. `@tanstack/ai-sandbox`'s
`reapDetachedRuns` recovers that run once the `detachedRunTtlMs` the
application passes to that sweep has elapsed — nothing derives it from
`withSandbox`, which has no TTL option — so the cost is a delayed teardown
rather than a lost one, provided the application actually schedules the
sweep, which is its job and not the framework's. Still strictly better than
failing the teardown.

## Parameters

### runs

[`RunStore`](../interfaces/RunStore.md)

### runId

`string`

## Returns

`Promise`\<`boolean`\>
