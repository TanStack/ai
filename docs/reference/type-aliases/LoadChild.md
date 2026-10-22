---
id: LoadChild
title: LoadChild
---

```ts
type LoadChild = (subagentRunId) => Promise<
  | {
  agent?: string;
  messages: (
     | ModelMessage
    | UIMessage)[];
}
| undefined>;
```

Defined in: packages/ai/src/activities/chat/middleware/load-child.ts:12

Loads the stored transcript of a finished subagent run by its
`subagentRunId`. Returns `undefined` for an unknown id. A persistence
middleware provides it. The agent tools read it to continue a
child by `sessionId`. When `agent` is set, only that agent can continue
the child. A middleware that provides it must list `LoadChildCapability`
in `provides`. Only then do the agent tools take `sessionId`.

## Parameters

### subagentRunId

`string`

## Returns

`Promise`\<
  \| \{
  `agent?`: `string`;
  `messages`: (
     \| [`ModelMessage`](../interfaces/ModelMessage.md)
    \| [`UIMessage`](../interfaces/UIMessage.md))[];
\}
  \| `undefined`\>
