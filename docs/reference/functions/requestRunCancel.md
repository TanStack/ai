---
id: requestRunCancel
title: requestRunCancel
---

# Function: requestRunCancel()

```ts
function requestRunCancel(runs, runId): Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/cancel.ts:48](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/cancel.ts#L48)

Record an explicit cancel on the run record.

Deliberately does NOT set a status. The driver is the only actor that knows
when the agent has actually stopped and the sandbox has been torn down, so it
owns the transition to `'aborted'`. Writing a terminal status here would tell
every reader the run is over while the agent is still burning tokens.

A no-op for an unknown `runId`, inheriting `RunStore.update`'s documented
invariant.

## Parameters

### runs

[`RunStore`](../interfaces/RunStore.md)

### runId

`string`

## Returns

`Promise`\<`void`\>
