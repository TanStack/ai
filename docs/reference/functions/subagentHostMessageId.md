---
id: subagentHostMessageId
title: subagentHostMessageId
---

```ts
function subagentHostMessageId(runId): string;
```

Defined in: [packages/ai/src/utilities/subagent-wire.ts:182](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/subagent-wire.ts#L182)

The id of the parent assistant message that hosts a routed turn's cards.
The persistence recorder writes that message, and a handoff run passes the
same id so the stored thread keeps one copy.

## Parameters

### runId

`string`

## Returns

`string`
