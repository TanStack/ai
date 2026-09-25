---
id: SubagentHandleData
title: SubagentHandleData
---

Defined in: [packages/ai/src/types.ts:502](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L502)

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

Defined in: [packages/ai/src/types.ts:516](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L516)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:509](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L509)

***

### interruptIds?

```ts
optional interruptIds?: string[];
```

Defined in: [packages/ai/src/types.ts:514](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L514)

Interrupts this child raised, while `status` is `'suspended'`.

***

### messages

```ts
messages: UIMessage<unknown>[];
```

Defined in: [packages/ai/src/types.ts:515](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L515)

***

### parentRunId?

```ts
optional parentRunId?: string;
```

Defined in: [packages/ai/src/types.ts:512](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L512)

The parent chat run that started this child.

***

### status

```ts
status: SubagentStatus;
```

Defined in: [packages/ai/src/types.ts:510](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L510)
