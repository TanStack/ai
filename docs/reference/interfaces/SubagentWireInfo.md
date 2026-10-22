---
id: SubagentWireInfo
title: SubagentWireInfo
---

Defined in: packages/ai/src/utilities/subagent-wire.ts:8

Card data that travels on each child wire message, in
`metadata.tanstack.subagent`. The messages carry the AG-UI `subagentRunId`.

## Extends

- `SubagentInfo`.`Pick`\<[`SubagentHandleData`](SubagentHandleData.md), 
  \| `"status"`
  \| `"error"`
  \| `"interruptIds"`
  \| `"parentSubagentRunId"`
  \| `"parentToolCallId"`
  \| `"metadata"`\>

## Properties

### error?

```ts
optional error?: Pick<SubagentErrorEvent, "message" | "code">;
```

Defined in: packages/ai/src/types.ts:649

#### Inherited from

```ts
Pick.error
```

***

### interruptIds?

```ts
optional interruptIds?: string[];
```

Defined in: packages/ai/src/types.ts:647

Interrupts this child raised, while `status` is `'suspended'`.

#### Inherited from

```ts
Pick.interruptIds
```

***

### placeholder?

```ts
optional placeholder?: true;
```

Defined in: packages/ai/src/utilities/subagent-wire.ts:21

The child has no messages yet. This wire message only holds the card.

***

### status

```ts
status: SubagentStatus;
```

Defined in: packages/ai/src/types.ts:643

#### Inherited from

[`SubagentHandleData`](SubagentHandleData.md).[`status`](SubagentHandleData.md#status)
