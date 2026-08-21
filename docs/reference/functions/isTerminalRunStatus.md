---
id: isTerminalRunStatus
title: isTerminalRunStatus
---

# Function: isTerminalRunStatus()

```ts
function isTerminalRunStatus(status): status is TerminalRunStatus;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:86](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L86)

Whether `status` means no further events will be appended. Narrows, so a
caller inside the guard can pass `status` where a [TerminalRunStatus](../type-aliases/TerminalRunStatus.md)
is required without a cast.

`Object.hasOwn`, never `in`: `in` walks the prototype chain, so a row whose
`status` column held `'toString'` or `'constructor'` would be reported
terminal. `status` is TYPED `RunStatus`, but every value reaching here comes
off a user-implemented [RunStore](../interfaces/RunStore.md) and the type is only a claim (see
[isRunStatus](isRunStatus.md)). A false `true` deletes a live run's journal
(`@tanstack/ai-sandbox`'s journal sweep), fails its attach as `'terminal-run'`
(`attach-preflight`), and refuses to drive it (`stream-to-response.ts`).

## Parameters

### status

[`RunStatus`](../type-aliases/RunStatus.md)

## Returns

`status is TerminalRunStatus`
