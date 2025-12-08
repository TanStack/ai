---
id: ToolCallArgsEvent
title: ToolCallArgsEvent
---

# Interface: ToolCallArgsEvent

Defined in: [types.ts:644](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L644)

Emitted when tool call arguments are streaming.

## Extends

- [`BaseEvent`](BaseEvent.md)

## Properties

### args?

```ts
optional args: string;
```

Defined in: [types.ts:650](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L650)

Full accumulated arguments so far

***

### delta

```ts
delta: string;
```

Defined in: [types.ts:648](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L648)

Incremental JSON arguments delta

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

Defined in: [types.ts:646](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L646)

***

### type

```ts
type: "TOOL_CALL_ARGS";
```

Defined in: [types.ts:645](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L645)

#### Overrides

[`BaseEvent`](BaseEvent.md).[`type`](BaseEvent.md#type)
