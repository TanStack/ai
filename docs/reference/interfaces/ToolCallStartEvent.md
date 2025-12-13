---
id: ToolCallStartEvent
title: ToolCallStartEvent
---

# Interface: ToolCallStartEvent

Defined in: [types.ts:700](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L700)

Emitted when a tool call starts.

## Extends

- [`BaseEvent`](BaseEvent.md)

## Properties

### approval?

```ts
optional approval: object;
```

Defined in: [types.ts:707](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L707)

Approval metadata if tool requires user approval

#### id

```ts
id: string;
```

#### needsApproval

```ts
needsApproval: true;
```

***

### index?

```ts
optional index: number;
```

Defined in: [types.ts:705](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L705)

Index for parallel tool calls

***

### model?

```ts
optional model: string;
```

Defined in: [types.ts:629](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L629)

TanStack AI addition: Model identifier for multi-model support

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`model`](BaseEvent.md#model)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:631](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L631)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`rawEvent`](BaseEvent.md#rawevent)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:627](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L627)

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`timestamp`](BaseEvent.md#timestamp)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:702](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L702)

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:703](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L703)

***

### type

```ts
type: "TOOL_CALL_START";
```

Defined in: [types.ts:701](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L701)

#### Overrides

[`BaseEvent`](BaseEvent.md).[`type`](BaseEvent.md#type)
