---
id: SubagentHandleData
title: SubagentHandleData
---

Defined in: [packages/ai/src/types.ts:486](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L486)

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

Defined in: [packages/ai/src/types.ts:500](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L500)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:493](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L493)

***

### interruptIds?

```ts
optional interruptIds?: string[];
```

Defined in: [packages/ai/src/types.ts:498](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L498)

Interrupts this child raised, while `status` is `'suspended'`.

***

### messages

```ts
messages: UIMessage<unknown>[];
```

Defined in: [packages/ai/src/types.ts:499](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L499)

***

### parentRunId?

```ts
optional parentRunId?: string;
```

Defined in: [packages/ai/src/types.ts:496](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L496)

The parent chat run that started this child.

***

### status

```ts
status: SubagentStatus;
```

Defined in: [packages/ai/src/types.ts:494](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L494)
