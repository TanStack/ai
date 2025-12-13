---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [types.ts:728](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L728)

Emitted when a tool call completes (with optional result).

## Extends

- [`BaseEvent`](BaseEvent.md)

## Properties

### input?

```ts
optional input: unknown;
```

Defined in: [types.ts:733](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L733)

Final parsed input arguments

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

### result?

```ts
optional result: unknown;
```

Defined in: [types.ts:735](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L735)

Tool execution result (present when tool has executed)

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

Defined in: [types.ts:730](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L730)

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:731](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L731)

***

### type

```ts
type: "TOOL_CALL_END";
```

Defined in: [types.ts:729](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L729)

#### Overrides

[`BaseEvent`](BaseEvent.md).[`type`](BaseEvent.md#type)
