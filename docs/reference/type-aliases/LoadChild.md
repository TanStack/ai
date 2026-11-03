---
id: LoadChild
title: LoadChild
---

```ts
type LoadChild = (subagentRunId, options?) => Promise<
  | {
  agent?: string;
  interruptIds?: string[];
  messages: (
     | ModelMessage
    | UIMessage)[];
  parentToolCallId?: string;
  pending?: (
     | ModelMessage
    | UIMessage)[];
}
| undefined>;
```

Defined in: [packages/ai/src/activities/chat/middleware/load-child.ts:17](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/load-child.ts#L17)

Loads the stored transcript of a finished subagent run by its
`subagentRunId`. Returns `undefined` for an unknown id. A persistence
middleware provides it. The agent tools read it to continue a
child by `sessionId`. When `agent` is set, only that agent can continue
the child. A middleware that provides it must list `LoadChildCapability`
in `provides`. Only then do the agent tools take `sessionId`.

With `parentSubagentRunId`, it loads a nested child: a child that the child
`parentSubagentRunId` started. It returns `undefined` when that child did
not start it. A loader that ignores the option fails closed for nested
children.

## Parameters

### subagentRunId

`string`

### options?

#### parentSubagentRunId?

`string`

## Returns

`Promise`\<
  \| \{
  `agent?`: `string`;
  `interruptIds?`: `string`[];
  `messages`: (
     \| [`ModelMessage`](../interfaces/ModelMessage.md)
    \| [`UIMessage`](../interfaces/UIMessage.md))[];
  `parentToolCallId?`: `string`;
  `pending?`: (
     \| [`ModelMessage`](../interfaces/ModelMessage.md)
    \| [`UIMessage`](../interfaces/UIMessage.md))[];
\}
  \| `undefined`\>
