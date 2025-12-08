---
id: ToolCallStartEvent
title: ToolCallStartEvent
---

# Interface: ToolCallStartEvent

Defined in: [types.ts:628](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L628)

Emitted when a tool call starts.

## Extends

- [`BaseEvent`](BaseEvent.md)

## Properties

### approval?

```ts
optional approval: object;
```

Defined in: [types.ts:635](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L635)

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

Defined in: [types.ts:633](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L633)

Index for parallel tool calls

***

### model?

```ts
optional model: string;
```

Defined in: [types.ts:557](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L557)

TanStack AI addition: Model identifier for multi-model support

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`model`](BaseEvent.md#model)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:559](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L559)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`rawEvent`](BaseEvent.md#rawevent)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:555](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L555)

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`timestamp`](BaseEvent.md#timestamp)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:630](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L630)

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:631](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L631)

***

### type

```ts
type: "TOOL_CALL_START";
```

Defined in: [types.ts:629](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L629)

#### Overrides

[`BaseEvent`](BaseEvent.md).[`type`](BaseEvent.md#type)
