---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [types.ts:656](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L656)

Emitted when a tool call completes (with optional result).

## Extends

- [`BaseEvent`](BaseEvent.md)

## Properties

### input?

```ts
optional input: unknown;
```

Defined in: [types.ts:661](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L661)

Final parsed input arguments

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

### result?

```ts
optional result: unknown;
```

Defined in: [types.ts:663](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L663)

Tool execution result (present when tool has executed)

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

Defined in: [types.ts:658](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L658)

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:659](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L659)

***

### type

```ts
type: "TOOL_CALL_END";
```

Defined in: [types.ts:657](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L657)

#### Overrides

[`BaseEvent`](BaseEvent.md).[`type`](BaseEvent.md#type)
