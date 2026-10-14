---
id: SubagentHandleData
title: SubagentHandleData
---

Defined in: [packages/ai/src/types.ts:635](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L635)

One child invocation as the client sees it. AG-UI `SubagentInfo` names the
child; the other AG-UI fields come from its `SUBAGENT_STARTED`,
`SUBAGENT_FINISHED` and `SUBAGENT_ERROR` events. `id` is the AG-UI
`subagentRunId`. `status`, `parentRunId` and `messages` are client state the
spec does not model.

## Extends

- `SubagentInfo`.`Pick`\<`AGUISubagentStartedEvent`, `"parentSubagentRunId"` \| `"parentToolCallId"` \| `"metadata"`\>

## Properties

### error?

```ts
optional error?: Pick<SubagentErrorEvent, "message" | "code">;
```

Defined in: [packages/ai/src/types.ts:649](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L649)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:642](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L642)

***

### interruptIds?

```ts
optional interruptIds?: string[];
```

Defined in: [packages/ai/src/types.ts:647](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L647)

Interrupts this child raised, while `status` is `'suspended'`.

***

### messages

```ts
messages: UIMessage<unknown>[];
```

Defined in: [packages/ai/src/types.ts:648](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L648)

***

### parentRunId?

```ts
optional parentRunId?: string;
```

Defined in: [packages/ai/src/types.ts:645](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L645)

The parent chat run that started this child.

***

### status

```ts
status: SubagentStatus;
```

Defined in: [packages/ai/src/types.ts:643](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L643)
